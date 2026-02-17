"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  FileText,
  QrCode,
  Sparkles,
  Upload,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";

type Step = 1 | 2 | 3 | 4;
type CampaignMode = "sms" | "phone";

const STEP_TITLES: Record<Step, string> = {
  1: "Campaign Setup",
  2: "Upload Contact CSV",
  3: "Setup Campaign Message",
  4: "Schedule the Launch",
};

function csvSample() {
  return `name,phone\nRam Sharma,+9779800000001\nSita Karki,+9779800000002\n`;
}

function getScriptInfo(text: string) {
  const devanagari = /[\u0900-\u097F]/.test(text);
  const chars = text.length;
  const divisor = devanagari ? 70 : 150;
  return {
    chars,
    estimateNtc: Math.max(1, Math.ceil(chars / divisor)),
    estimateOther: Math.max(2, Math.ceil(chars / divisor) * 2),
    devanagari,
  };
}

export default function GetStartedPage() {
  const [step, setStep] = useState<Step>(1);
  const [campaignName, setCampaignName] = useState("");
  const [campaignMode, setCampaignMode] = useState<CampaignMode>("sms");
  const [selectedDialingNumbers, setSelectedDialingNumbers] = useState<string[]>([]);

  const [campaignId, setCampaignId] = useState<string>("");
  const [contactsFile, setContactsFile] = useState<File | null>(null);
  const [smsMessage, setSmsMessage] = useState("Namaste {{name}}, AgentShakti bata call/sms reminder chha.");
  const [scheduleAt, setScheduleAt] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  const scriptInfo = useMemo(() => getScriptInfo(smsMessage), [smsMessage]);

  function clearBanners() {
    setError("");
    setSuccess("");
  }

  function onDownloadSample() {
    const blob = new Blob([csvSample()], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "agentshakti-contacts-sample.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function createDraftCampaign() {
    if (campaignId) return campaignId;
    if (!campaignName.trim()) {
      setError("Campaign name is required.");
      return "";
    }
    const created = await api.createCampaign({
      name: campaignName.trim(),
      type: campaignMode === "phone" ? "voice" : "text",
      category: campaignMode === "phone" ? "voice" : "text",
    });
    setCampaignId(created.id);
    return created.id;
  }

  async function onNext() {
    clearBanners();
    setBusy(true);
    try {
      if (step === 1) {
        const id = await createDraftCampaign();
        if (!id) return;
        setStep(2);
        return;
      }

      if (step === 2) {
        if (!campaignId) {
          setError("Campaign draft is missing. Go back and retry.");
          return;
        }
        if (contactsFile) {
          await api.uploadCampaignContacts(campaignId, contactsFile);
        }
        setStep(3);
        return;
      }

      if (step === 3) {
        if (!smsMessage.trim()) {
          setError("Message is required.");
          return;
        }
        setStep(4);
      }
    } catch (e) {
      if (e instanceof ApiError) {
        setError(`Request failed (${e.status}). ${e.message}`);
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onCreateCampaign() {
    clearBanners();
    if (!campaignId) {
      setError("Campaign draft missing. Please restart setup.");
      return;
    }
    setBusy(true);
    try {
      const iso = scheduleAt ? new Date(scheduleAt).toISOString() : undefined;
      await api.startCampaign(campaignId, iso);
      setSuccess("Campaign created successfully.");
    } catch (e) {
      if (e instanceof ApiError) {
        setError(`Launch failed (${e.status}). ${e.message}`);
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Failed to create campaign.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onSaveDraft() {
    clearBanners();
    setBusy(true);
    try {
      await createDraftCampaign();
      setSuccess("Draft saved.");
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Failed to save draft.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#dfe3f2] bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.18em] text-[#0052FF]">Close</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#0F172A]">Set up your campaign in four simple steps.</h1>
        <p className="mt-1 text-sm text-[#64748B]">{STEP_TITLES[step]}</p>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((n) => {
            const current = step === n;
            const done = step > n;
            return (
              <div
                key={n}
                className={`rounded-xl border px-3 py-2 text-xs ${current ? "border-[#0052FF] bg-[#eff4ff] text-[#0052FF]" : done ? "border-[#B9E6C7] bg-[#f2fbf5] text-[#0f6b32]" : "border-[#e2e8f0] text-[#64748B]"}`}
              >
                <div className="font-semibold">Step {n}</div>
                <div className="mt-0.5">{STEP_TITLES[n as Step]}</div>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#9f1239]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm text-[#166534]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {step === 1 && (
        <section className="rounded-2xl border border-[#dfe3f2] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[#0F172A]">Campaign Setup</h2>
          <p className="mt-1 text-sm text-[#64748B]">
            Define your campaign&apos;s purpose and configure key details.
          </p>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-[#0F172A]">Campaign Name*</span>
              <input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Campaign Name"
                className="h-12 w-full rounded-xl border border-[#d6dceb] px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#0052FF]"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-[#0F172A]">Select Dialing Numbers</span>
              <select
                multiple
                value={selectedDialingNumbers}
                onChange={(e) => setSelectedDialingNumbers(Array.from(e.target.selectedOptions).map((o) => o.value))}
                className="min-h-[88px] w-full rounded-xl border border-[#d6dceb] px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#0052FF]"
              >
                <option value="+977-9801000001">+977-9801000001</option>
                <option value="+977-9801000002">+977-9801000002</option>
                <option value="+977-9801000003">+977-9801000003</option>
              </select>
            </label>
          </div>

          <div className="mt-5">
            <p className="text-sm font-medium text-[#0F172A]">Campaign Type*</p>
            <div className="mt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setCampaignMode("sms")}
                className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${campaignMode === "sms" ? "border-[#0052FF] bg-[#0052FF] text-white" : "border-[#d6dceb] text-[#334155] hover:border-[#93c5fd]"}`}
              >
                SMS
              </button>
              <button
                type="button"
                onClick={() => setCampaignMode("phone")}
                className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${campaignMode === "phone" ? "border-[#0052FF] bg-[#0052FF] text-white" : "border-[#d6dceb] text-[#334155] hover:border-[#93c5fd]"}`}
              >
                Phone
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="rounded-2xl border border-[#dfe3f2] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[#0F172A]">Upload Contact CSV</h2>
          <p className="mt-1 text-sm text-[#64748B]">Upload Contacts*</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onDownloadSample}
              className="inline-flex items-center gap-2 rounded-xl border border-[#d6dceb] px-4 py-2 text-sm text-[#334155] hover:border-[#0052FF]"
            >
              <FileText className="h-4 w-4" />
              Download Sample CSV
            </button>
            <button
              type="button"
              onClick={() => setSuccess("QR upload will be enabled next. Use file upload for now.")}
              className="inline-flex items-center gap-2 rounded-xl border border-[#d6dceb] px-4 py-2 text-sm text-[#334155] hover:border-[#0052FF]"
            >
              <QrCode className="h-4 w-4" />
              Upload via QR Code
            </button>
          </div>

          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#9db4e3] bg-[#f8faff] px-6 py-10 text-center">
            <Upload className="h-6 w-6 text-[#0052FF]" />
            <span className="mt-2 text-sm font-medium text-[#0F172A]">Upload File</span>
            <span className="mt-1 text-xs text-[#64748B]">CSV, XLS are allowed</span>
            <input
              type="file"
              accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => setContactsFile(e.target.files?.[0] || null)}
            />
            {contactsFile && (
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#e7f0ff] px-3 py-1 text-xs text-[#0052FF]">
                <FileUp className="h-3.5 w-3.5" />
                {contactsFile.name}
              </span>
            )}
          </label>
        </section>
      )}

      {step === 3 && (
        <section className="rounded-2xl border border-[#dfe3f2] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[#0F172A]">Setup Campaign Message</h2>

          <div className="mt-4">
            <p className="text-sm font-medium text-[#0F172A]">Campaign Type*</p>
            <p className="text-xs text-[#64748B]">Select the type of campaign you want to create</p>
            <div className="mt-2 inline-flex rounded-xl border border-[#d6dceb] bg-[#f8fafc] p-1">
              <span className="rounded-lg bg-[#0052FF] px-3 py-1.5 text-xs font-medium text-white">
                {campaignMode === "phone" ? "Voice Based" : "Text Based"}
              </span>
            </div>
          </div>

          <label className="mt-4 block space-y-2">
            <span className="text-sm font-medium text-[#0F172A]">
              {campaignMode === "phone" ? "Voice Script*" : "SMS Message*"}
            </span>
            <textarea
              value={smsMessage}
              onChange={(e) => setSmsMessage(e.target.value)}
              rows={5}
              placeholder="Draft your message for the Campaign"
              className="w-full rounded-xl border border-[#d6dceb] px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#0052FF]"
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSmsMessage((prev) => `${prev} {{name}}`)}
              className="rounded-lg border border-[#d6dceb] px-3 py-1.5 text-xs text-[#334155] hover:border-[#0052FF]"
            >
              Insert Variable
            </button>
            <button
              type="button"
              onClick={() => setSmsMessage("Namaste {{name}}, AgentShakti bata yo automated reminder ho.")}
              className="rounded-lg border border-[#d6dceb] px-3 py-1.5 text-xs text-[#334155] hover:border-[#0052FF]"
            >
              Message Templates
            </button>
            <button
              type="button"
              onClick={() => setSuccess("Devanagari conversion option will be connected with transliteration next.")}
              className="rounded-lg border border-[#d6dceb] px-3 py-1.5 text-xs text-[#334155] hover:border-[#0052FF]"
            >
              Change To Devanagari
            </button>
            <button
              type="button"
              onClick={() => setSuccess("English conversion option will be connected with transliteration next.")}
              className="rounded-lg border border-[#d6dceb] px-3 py-1.5 text-xs text-[#334155] hover:border-[#0052FF]"
            >
              Change To English
            </button>
            <button
              type="button"
              onClick={() => setSmsMessage((prev) => `${prev} हामी सहयोगका लागि 24/7 उपलब्ध छौं।`)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#b8cdfa] bg-[#eff4ff] px-3 py-1.5 text-xs text-[#0052FF]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI Paraphrase
            </button>
          </div>

          <div className="mt-5 rounded-xl border border-[#d6dceb] bg-[#f8fafc] p-4 text-sm">
            <p className="font-medium text-[#0F172A]">Estimated SMS Cost: {scriptInfo.estimateNtc}</p>
            <p className="mt-1 text-[#475569]">Character Count: {scriptInfo.chars}</p>
            <div className="mt-3 text-xs text-[#64748B]">
              <p className="font-medium text-[#334155]">Message Details:</p>
              <p>Payment Type: variable</p>
              <p className="mt-1 font-medium text-[#334155]">Cost by Provider</p>
              <p>NTC: 1 Credit / 150 chars</p>
              <p>Other Providers: 2 Credits / 150 chars</p>
              <p className="mt-2">
                Note: For Devanagari script, 70 characters = 1 Credit for NTC and 2 Credits for others.
              </p>
            </div>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="rounded-2xl border border-[#dfe3f2] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[#0F172A]">Schedule the Launch</h2>
          <p className="mt-1 text-sm text-[#64748B]">Schedule Date &amp; Time</p>
          <div className="mt-4 max-w-sm">
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="h-12 w-full rounded-xl border border-[#d6dceb] px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#0052FF]"
            />
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/campaigns"
          className="rounded-xl border border-[#d6dceb] px-4 py-2 text-sm text-[#334155] hover:border-[#94a3b8]"
        >
          Cancel
        </Link>

        {step > 1 && (
          <button
            type="button"
            onClick={() => {
              clearBanners();
              setStep((Math.max(1, step - 1) as Step));
            }}
            className="rounded-xl border border-[#d6dceb] px-4 py-2 text-sm text-[#334155] hover:border-[#94a3b8]"
          >
            Back
          </button>
        )}

        {step < 4 ? (
          <button
            type="button"
            onClick={onNext}
            disabled={busy}
            className="rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? "Please wait..." : "Next"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={busy}
              className="rounded-xl border border-[#d6dceb] px-4 py-2 text-sm text-[#334155] hover:border-[#94a3b8] disabled:opacity-60"
            >
              Save to draft
            </button>
            <button
              type="button"
              onClick={onCreateCampaign}
              disabled={busy}
              className="rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? "Creating..." : "Create Campaign"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
