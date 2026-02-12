"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, Trash2, X } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { Template } from "@/lib/api";
import * as api from "@/lib/api";

export default function TemplatesPage() {
  const { orgId } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formType, setFormType] = useState<"voice" | "text">("voice");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.listTemplates({ page, page_size: 20 });
      let items = resp.items;
      if (search.trim()) {
        const q = search.toLowerCase();
        items = items.filter(
          (t) => t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q),
        );
      }
      setTemplates(items);
      setTotal(resp.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormContent("");
    setFormType("voice");
    setShowModal(true);
  };

  const openEdit = (t: Template) => {
    setEditingId(t.id);
    setFormName(t.name);
    setFormContent(t.content);
    setFormType(t.type);
    setShowModal(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await api.updateTemplate(editingId, { name: formName, content: formContent });
      } else {
        await api.createTemplate({
          org_id: orgId,
          name: formName,
          type: formType,
          content: formContent,
        });
      }
      setShowModal(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteTemplate(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Message Templates</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-[#4ECDC4] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#44a8a0]"
        >
          <Plus size={16} />
          Create Message Template
        </button>
      </div>

      <div className="relative w-72">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#4ECDC4]"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left">
              <th className="px-5 py-3 font-semibold text-gray-600">Title</th>
              <th className="px-5 py-3 font-semibold text-gray-600">Content</th>
              <th className="px-5 py-3 font-semibold text-gray-600">Type</th>
              <th className="px-5 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-gray-400">Loading...</td>
              </tr>
            ) : templates.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-gray-400">
                  No templates found
                </td>
              </tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="max-w-md truncate px-5 py-3 text-gray-600">{t.content}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                      {t.type}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(t)}
                        className="text-gray-400 hover:text-[#4ECDC4]"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
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

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? "Edit Template" : "Create Template"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
                <input
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#4ECDC4]"
                />
              </div>
              {!editingId && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
                  <div className="flex gap-3">
                    {(["voice", "text"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setFormType(t)}
                        className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                          formType === t
                            ? "border-[#4ECDC4] bg-[#4ECDC4]/10 text-[#4ECDC4]"
                            : "border-gray-300 text-gray-600"
                        }`}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Content</label>
                <textarea
                  required
                  rows={5}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#4ECDC4]"
                  placeholder="Use {variable_name} for dynamic content"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#4ECDC4] px-4 py-2 text-sm font-semibold text-white hover:bg-[#44a8a0] disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingId ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
