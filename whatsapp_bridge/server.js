require("dotenv").config();

const express = require("express");
const cors = require("cors");
const qrcode = require("qrcode");
const { Client, LocalAuth } = require("whatsapp-web.js");

const PORT = Number(process.env.PORT || 3010);
const BRIDGE_TOKEN = process.env.WHATSAPP_BRIDGE_TOKEN || "";
const BACKEND_WEBHOOK_URL = process.env.BACKEND_WEBHOOK_URL || "";
const BACKEND_WEBHOOK_TOKEN = process.env.BACKEND_WEBHOOK_TOKEN || "";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

let state = "initializing";
let currentQr = "";
let lastError = "";
let readyAt = null;

function normalizeTarget(to) {
  const raw = String(to || "").trim();
  if (!raw) return "";
  if (raw.endsWith("@c.us") || raw.endsWith("@g.us")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return `${digits}@c.us`;
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

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "agentshakti-linked" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  },
});

client.on("qr", (qr) => {
  currentQr = qr;
  state = "pairing_required";
  console.log("[whatsapp-bridge] QR updated");
});

client.on("authenticated", () => {
  state = "authenticated";
  console.log("[whatsapp-bridge] authenticated");
});

client.on("ready", () => {
  state = "ready";
  readyAt = new Date().toISOString();
  currentQr = "";
  console.log("[whatsapp-bridge] ready");
});

client.on("auth_failure", (msg) => {
  state = "auth_failed";
  lastError = String(msg || "auth failure");
  console.error("[whatsapp-bridge] auth failure", msg);
});

client.on("disconnected", (reason) => {
  state = "disconnected";
  lastError = String(reason || "disconnected");
  console.warn("[whatsapp-bridge] disconnected", reason);
});

client.on("message", async (message) => {
  if (!BACKEND_WEBHOOK_URL) return;
  try {
    const payload = {
      from: message.from,
      body: message.body || "",
      message_id: message.id?._serialized || null,
      timestamp: message.timestamp || null,
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
});

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
    if (state !== "ready") {
      return res.status(503).json({ error: "whatsapp_not_ready", state });
    }
    const sent = await client.sendMessage(to, message);
    return res.json({ status: "sent", id: sent?.id?._serialized || null, to });
  } catch (err) {
    return res.status(502).json({ error: String(err?.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`[whatsapp-bridge] listening on :${PORT}`);
});

client.initialize().catch((err) => {
  state = "init_failed";
  lastError = String(err?.message || err);
  console.error("[whatsapp-bridge] init failed", err);
});
