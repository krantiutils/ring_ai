"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { Contact, CampaignWithStats } from "@/lib/api";
import * as api from "@/lib/api";

export default function CampaignContactsPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<CampaignWithStats | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, contactsResp] = await Promise.all([
        api.getCampaign(campaignId),
        api.listCampaignContacts(campaignId, { page, page_size: 20 }),
      ]);
      setCampaign(c);
      setContacts(contactsResp.items);
      setTotal(contactsResp.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [campaignId, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const resp = await api.uploadContacts(campaignId, file);
      setSuccess(`Added ${resp.contacts_added} contacts`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleRemove = async (contactId: string) => {
    try {
      await api.removeContact(campaignId, contactId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    }
  };

  const isDraft = campaign?.status === "draft";
  const totalPages = Math.ceil(total / 20);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#4ECDC4] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/campaigns/${campaignId}`} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            Contacts — {campaign?.name}
          </h1>
        </div>
        {isDraft && (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#4ECDC4] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#44a8a0]">
            <Upload size={16} />
            {uploading ? "Uploading..." : "Upload CSV"}
            <input type="file" accept=".csv" onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
        )}
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
      {success && <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-600">{success}</div>}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left">
              <th className="px-5 py-3 font-semibold text-gray-600">Phone</th>
              <th className="px-5 py-3 font-semibold text-gray-600">Name</th>
              <th className="px-5 py-3 font-semibold text-gray-600">Added</th>
              {isDraft && <th className="px-5 py-3 font-semibold text-gray-600">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={isDraft ? 4 : 3} className="px-5 py-12 text-center text-gray-400">
                  No contacts yet
                </td>
              </tr>
            ) : (
              contacts.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-mono text-gray-900">{c.phone}</td>
                  <td className="px-5 py-3 text-gray-600">{c.name || "—"}</td>
                  <td className="px-5 py-3 text-gray-500">{formatDateTime(c.created_at)}</td>
                  {isDraft && (
                    <td className="px-5 py-3">
                      <button
                        onClick={() => handleRemove(c.id)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
