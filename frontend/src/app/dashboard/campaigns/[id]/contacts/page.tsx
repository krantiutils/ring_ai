"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Upload,
} from "lucide-react";
import {
  campaigns,
  type Contact,
  type CampaignWithStats,
  type PaginatedResponse,
} from "@/lib/api";

const PAGE_SIZE = 20;

export default function CampaignContactsPage() {
  const params = useParams();
  const id = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [campaign, setCampaign] = useState<CampaignWithStats | null>(null);
  const [data, setData] = useState<PaginatedResponse<Contact> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState("");

  const fetchCampaign = useCallback(async () => {
    try {
      setCampaign(await campaigns.get(id));
    } catch {
      // handled below
    }
  }, [id]);

  const fetchContacts = useCallback(async () => {
    setError("");
    try {
      const result = await campaigns.listContacts(id, {
        page,
        page_size: PAGE_SIZE,
      });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contacts");
    }
  }, [id, page]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult("");
    setError("");
    try {
      const result = await campaigns.uploadContacts(id, file);
      setUploadResult(
        `Added ${result.created} contacts, ${result.skipped} skipped.${
          result.errors.length > 0
            ? ` Errors: ${result.errors.join(", ")}`
            : ""
        }`,
      );
      await fetchContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemove(contactId: string) {
    try {
      await campaigns.removeContact(id, contactId);
      await fetchContacts();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove contact",
      );
    }
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const isDraft = campaign?.status === "draft";

  return (
    <div>
      <Link
        href={`/dashboard/campaigns/${id}`}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to campaign
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          {campaign && (
            <p className="text-sm text-gray-500 mt-1">
              {campaign.name} — {data?.total ?? 0} contacts
            </p>
          )}
        </div>

        {isDraft && (
          <div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--clay-teal)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Upload className="w-4 h-4" />
              {uploading ? "Uploading…" : "Upload CSV"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleUpload}
              className="hidden"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}
      {uploadResult && (
        <div className="mb-4 p-4 rounded-xl bg-green-50 text-green-700 text-sm">
          {uploadResult}
        </div>
      )}

      <div className="clay-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-3 font-medium text-gray-500">
                Phone
              </th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">
                Name
              </th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">
                Added
              </th>
              {isDraft && (
                <th className="text-right px-6 py-3 font-medium text-gray-500">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data?.items.map((c) => (
              <tr
                key={c.id}
                className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors"
              >
                <td className="px-6 py-3 font-mono text-xs">{c.phone}</td>
                <td className="px-6 py-3">{c.name ?? "—"}</td>
                <td className="px-6 py-3 text-gray-500">
                  {new Date(c.created_at).toLocaleDateString()}
                </td>
                {isDraft && (
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => handleRemove(c.id)}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Remove contact"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td
                  colSpan={isDraft ? 4 : 3}
                  className="px-6 py-12 text-center text-gray-400"
                >
                  No contacts yet.
                  {isDraft && " Upload a CSV to add contacts."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages} ({data?.total} total)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-xl bg-white border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-xl bg-white border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
