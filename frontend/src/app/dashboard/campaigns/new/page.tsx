"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import type { Template } from "@/lib/api";
import * as api from "@/lib/api";

export default function NewCampaignPage() {
  const router = useRouter();
  const { orgId } = useAuth();
  const [name, setName] = useState("");
  const [type, setType] = useState<"voice" | "text" | "form">("voice");
  const [templateId, setTemplateId] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"immediate" | "scheduled">("immediate");
  const [scheduledAt, setScheduledAt] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listTemplates({ page_size: 100 }).then((r) => setTemplates(r.items)).catch(() => {});
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!orgId) {
        setError("Organization not set. Please log in again.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const campaign = await api.createCampaign({
          name,
          type,
          org_id: orgId,
          template_id: templateId || undefined,
          schedule_config:
            scheduleMode === "scheduled" && scheduledAt
              ? { mode: "scheduled", scheduled_at: scheduledAt, timezone: "Asia/Kathmandu" }
              : { mode: "immediate", timezone: "Asia/Kathmandu" },
        });

        if (file) {
          await api.uploadContacts(campaign.id, file);
        }

        router.push(`/dashboard/campaigns/${campaign.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create campaign");
      } finally {
        setLoading(false);
      }
    },
    [name, type, orgId, templateId, scheduleMode, scheduledAt, file, router],
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/campaigns" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">New Campaign</h1>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Campaign Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#4ECDC4]"
            placeholder="Enter campaign name"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Service Type</label>
          <div className="flex gap-3">
            {(["voice", "text", "form"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  type === t
                    ? "border-[#4ECDC4] bg-[#4ECDC4]/10 text-[#4ECDC4]"
                    : "border-gray-300 text-gray-600 hover:border-gray-400"
                }`}
              >
                {t === "voice" ? "Phone" : t === "text" ? "SMS" : "Survey"}
              </button>
            ))}
          </div>
        </div>

        {type === "voice" && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Template</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none"
            >
              <option value="">Select a template</option>
              {templates
                .filter((t) => t.type === "voice")
                .map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Schedule</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setScheduleMode("immediate")}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                scheduleMode === "immediate"
                  ? "border-[#4ECDC4] bg-[#4ECDC4]/10 text-[#4ECDC4]"
                  : "border-gray-300 text-gray-600"
              }`}
            >
              Immediate
            </button>
            <button
              type="button"
              onClick={() => setScheduleMode("scheduled")}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                scheduleMode === "scheduled"
                  ? "border-[#4ECDC4] bg-[#4ECDC4]/10 text-[#4ECDC4]"
                  : "border-gray-300 text-gray-600"
              }`}
            >
              Scheduled
            </button>
          </div>
          {scheduleMode === "scheduled" && (
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none"
            />
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Contacts CSV (optional)
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-[#4ECDC4] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#44a8a0] disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Campaign"}
        </button>
      </form>
    </div>
  );
}
