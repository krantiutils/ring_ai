"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, X } from "lucide-react";
import {
  campaigns,
  templates as templatesApi,
  type CampaignType,
  type Template,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type ServiceType = "voice" | "text" | "voice_and_text";

const SERVICE_OPTIONS: { value: ServiceType; label: string }[] = [
  { value: "voice", label: "Phone Call" },
  { value: "text", label: "SMS" },
  { value: "voice_and_text", label: "Phone & SMS" },
];

const SCHEDULE_MODES = [
  { value: "immediate", label: "Send immediately" },
  { value: "scheduled", label: "Schedule for later" },
];

export default function NewCampaignPage() {
  const router = useRouter();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [name, setName] = useState("");
  const [service, setService] = useState<ServiceType>("voice");
  const [templateId, setTemplateId] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [scheduleMode, setScheduleMode] = useState("immediate");
  const [scheduledAt, setScheduledAt] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [templateList, setTemplateList] = useState<Template[]>([]);

  // Load templates
  useEffect(() => {
    templatesApi
      .list({ page: 1, page_size: 100 })
      .then((res) => setTemplateList(res.items))
      .catch(() => {
        // Templates might not be available, that's ok
      });
  }, []);

  const campaignType: CampaignType =
    service === "text" ? "text" : "voice";

  const voiceTemplates = templateList.filter((t) => t.type === "voice");

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) setCsvFile(file);
    },
    [],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    setError("");
    setSubmitting(true);

    try {
      // Create the campaign
      const campaign = await campaigns.create({
        name,
        type: campaignType,
        org_id: user.org_id,
        template_id: templateId || null,
        schedule_config:
          scheduleMode === "scheduled" && scheduledAt
            ? {
                mode: "scheduled",
                scheduled_at: new Date(scheduledAt).toISOString(),
                timezone: "Asia/Kathmandu",
              }
            : { mode: "immediate", timezone: "Asia/Kathmandu" },
      });

      // Upload contacts CSV if provided
      if (csvFile) {
        await campaigns.uploadContacts(campaign.id, csvFile);
      }

      router.push(`/dashboard/campaigns/${campaign.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create campaign",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Back link */}
      <Link
        href="/dashboard/campaigns"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to campaigns
      </Link>

      <h1 className="text-2xl font-bold mb-6">Create Campaign</h1>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Campaign name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Campaign Name
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--clay-teal)] text-sm"
            placeholder="e.g. Dashain Greeting 2083"
          />
        </div>

        {/* Service type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Service
          </label>
          <div className="flex gap-3">
            {SERVICE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setService(opt.value)}
                className={cn(
                  "flex-1 px-4 py-3 rounded-xl text-sm font-medium border transition-colors",
                  service === opt.value
                    ? "border-[var(--clay-coral)] bg-[var(--clay-coral)]/10 text-[var(--clay-coral)]"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Voice template selection */}
        {(service === "voice" || service === "voice_and_text") && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Voice Template
            </label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--clay-teal)] text-sm"
            >
              <option value="">Select a template…</option>
              {voiceTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {voiceTemplates.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">
                No voice templates available. Create one first.
              </p>
            )}
          </div>
        )}

        {/* SMS message */}
        {(service === "text" || service === "voice_and_text") && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              SMS Message
            </label>
            <textarea
              value={smsMessage}
              onChange={(e) => setSmsMessage(e.target.value)}
              rows={4}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--clay-teal)] text-sm resize-none"
              placeholder="Type your SMS message. Use {{variable_name}} for personalization."
            />
            <p className="text-xs text-gray-400 mt-1">
              Variables: {"{{name}}"}, {"{{phone}}"}, {"{{amount}}"}, etc.
            </p>
          </div>
        )}

        {/* Schedule */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Schedule
          </label>
          <div className="flex gap-3 mb-3">
            {SCHEDULE_MODES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setScheduleMode(opt.value)}
                className={cn(
                  "flex-1 px-4 py-3 rounded-xl text-sm font-medium border transition-colors",
                  scheduleMode === opt.value
                    ? "border-[var(--clay-teal)] bg-[var(--clay-teal)]/10 text-[var(--clay-teal)]"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {scheduleMode === "scheduled" && (
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--clay-teal)] text-sm"
            />
          )}
        </div>

        {/* CSV upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Contacts (CSV)
          </label>
          {csvFile ? (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white">
              <span className="text-sm text-gray-700 flex-1 truncate">
                {csvFile.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  setCsvFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-gray-300 hover:text-gray-600 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Click to upload CSV
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <p className="text-xs text-gray-400 mt-1">
            CSV with columns: phone, name (optional), and any metadata columns.
          </p>
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || !name}
            className="px-6 py-3 rounded-xl bg-[var(--clay-coral)] text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? "Creating…" : "Create Campaign"}
          </button>
          <Link
            href="/dashboard/campaigns"
            className="px-6 py-3 rounded-xl bg-white border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
