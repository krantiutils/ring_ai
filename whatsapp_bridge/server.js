require("dotenv").config();

const express = require("express");
const cors = require("cors");
const qrcode = require("qrcode");
const qrcodeTerminal = require("qrcode-terminal");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");

const PORT = Number(process.env.PORT || 3010);
const BRIDGE_TOKEN = process.env.WHATSAPP_BRIDGE_TOKEN || "";
const BACKEND_WEBHOOK_URL = process.env.BACKEND_WEBHOOK_URL || "";
const BACKEND_WEBHOOK_TOKEN = process.env.BACKEND_WEBHOOK_TOKEN || "";
const AUTH_DIR = process.env.WHATSAPP_BAILEYS_AUTH_DIR || ".baileys_auth";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

let sock = null;
let state = "initializing";
let currentQr = "";
let lastError = "";
let readyAt = null;

function normalizeTarget(to) {
  const raw = String(to || "").trim();
  if (!raw) return "";
  if (raw.endsWith("@s.whatsapp.net") || raw.endsWith("@g.us")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return `${digits}@s.whatsapp.net`;
}

function guard(req, res, next) {
  if (!BRIDGE_TOKEN) return next();
  const header = req.headers["x-bridge-token"] || req.headers["authorization"] || "";
  const token = String(header).replace(/^Bearer\s+/i, "").trim();
  if (token !== BRIDGE_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

function extractText(messageContent) {
  if (!messageContent) return "";
  if (typeof messageContent.conversation === "string") return messageContent.conversation;
  if (typeof messageContent.extendedTextMessage?.text === "string") {
    return messageContent.extendedTextMessage.text;
  }
  if (typeof messageContent.imageMessage?.caption === "string") {
    return messageContent.imageMessage.caption;
  }
  return "";
}

async function forwardInboundMessage(message) {
  if (!BACKEND_WEBHOOK_URL) return;
  const body = extractText(message.message);
  if (!body) return;
  try {
    const payload = {
      from: message.key?.remoteJid || "",
      body,
      message_id: message.key?.id || null,
      timestamp: message.messageTimestamp || null,
    };
    const headers = { "content-type": "application/json" };
    if (BACKEND_WEBHOOK_TOKEN) headers["x-bridge-token"] = BACKEND_WEBHOOK_TOKEN;
    await fetch(BACKEND_WEBHOOK_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[whatsapp-bridge] inbound forward failed", err?.message || err);
  }
}

async function startSocket() {
  const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  sock = makeWASocket({
    auth: authState,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    browser: ["AgentShakti", "Chrome", "1.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQr = qr;
      state = "pairing_required";
      lastError = "";
      console.log("[whatsapp-bridge] QR updated");
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === "open") {
      state = "ready";
      readyAt = new Date().toISOString();
      currentQr = "";
      lastError = "";
      console.log("[whatsapp-bridge] ready");
      return;
    }

    if (connection !== "close") return;

    const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
    const reason = String(lastDisconnect?.error?.message || "disconnected");
    if (statusCode === DisconnectReason.loggedOut) {
      state = "logged_out";
      lastError = reason;
      currentQr = "";
      readyAt = null;
      console.warn("[whatsapp-bridge] logged out; restart bridge to re-pair");
      return;
    }

    state = "reconnecting";
    lastError = reason;
    console.warn("[whatsapp-bridge] disconnected, reconnecting");
    setTimeout(() => {
      startSocket().catch((err) => {
        state = "init_failed";
        lastError = String(err?.message || err);
        console.error("[whatsapp-bridge] init failed", err);
      });
    }, 1000);
  });

  sock.ev.on("messages.upsert", async ({ type, messages }) => {
    if (type !== "notify" || !Array.isArray(messages)) return;
    for (const message of messages) {
      if (!message?.key || message.key.fromMe) continue;
      await forwardInboundMessage(message);
    }
  });
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", state });
});

app.get("/status", guard, (_req, res) => {
  res.json({ state, ready_at: readyAt, has_qr: Boolean(currentQr), last_error: lastError || null });
});

app.get("/qr", guard, async (_req, res) => {
  if (!currentQr) {
    return res.status(404).json({ error: "qr_not_available" });
  }
  const dataUrl = await qrcode.toDataURL(currentQr, { margin: 1, width: 320 });
  res.json({ qr: currentQr, qr_data_url: dataUrl });
});

app.post("/send", guard, async (req, res) => {
  try {
    const to = normalizeTarget(req.body?.to);
    const message = String(req.body?.message || "").trim();
    if (!to || !message) {
      return res.status(422).json({ error: "to and message are required" });
    }
    if (!sock || state !== "ready") {
      return res.status(503).json({ error: "whatsapp_not_ready", state });
    }
    const sent = await sock.sendMessage(to, { text: message });
    return res.json({ status: "sent", id: sent?.key?.id || null, to });
  } catch (err) {
    return res.status(502).json({ error: String(err?.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`[whatsapp-bridge] listening on :${PORT}`);
});

startSocket().catch((err) => {
  state = "init_failed";
  lastError = String(err?.message || err);
  console.error("[whatsapp-bridge] init failed", err);
});
