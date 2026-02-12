"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Pencil, Trash2, MessageSquare } from "lucide-react";
import { api } from "@/lib/api";
import type { Template } from "@/types/dashboard";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const data = await api.getTemplates(params.toString());
      setTemplates(data.templates);
      setTotal(data.total);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    try {
      await api.deleteTemplate(id);
      loadTemplates();
    } catch (err) {
      console.error("Failed to delete template:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2D2D2D]/40" />
          <input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40 focus:border-transparent"
          />
        </div>
        <button className="ml-auto flex items-center gap-2 bg-[#FF6B6B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#ff5252] transition-colors">
          <Plus className="w-4 h-4" />
          Create Message Template
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#FF6B6B]/10 bg-[#FFF8F0]/50">
              <th className="text-left text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-6 py-3">Title</th>
              <th className="text-left text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-6 py-3">Content</th>
              <th className="text-left text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-6 py-3">Type</th>
              <th className="text-right text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#FF6B6B]/10">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#FF6B6B]" />
                  </div>
                </td>
              </tr>
            ) : templates.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-[#FFF8F0] flex items-center justify-center">
                      <MessageSquare className="w-7 h-7 text-[#FF6B6B]/40" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#2D2D2D]/60">No templates yet</p>
                      <p className="text-xs text-[#2D2D2D]/40 mt-1">Create a message template to get started</p>
                    </div>
                    <button className="mt-2 flex items-center gap-1.5 bg-[#FF6B6B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#ff5252] transition-colors">
                      <Plus className="w-4 h-4" />
                      Create Template
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              templates.map((template) => (
                <tr key={template.id} className="hover:bg-[#FFF8F0]/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-[#2D2D2D]">{template.name}</td>
                  <td className="px-6 py-4 text-sm text-[#2D2D2D]/60 max-w-md truncate">{template.content}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FF6B6B]/15 text-[#FF6B6B] capitalize">
                      {template.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-1.5 rounded-lg hover:bg-[#FFF8F0] text-[#2D2D2D]/40 hover:text-[#FF6B6B] transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(template.id)}
                        className="p-1.5 rounded-lg hover:bg-[#FF6B6B]/10 text-[#2D2D2D]/40 hover:text-[#FF6B6B] transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {total > 0 && (
          <div className="px-6 py-3 border-t border-[#FF6B6B]/10 text-xs text-[#2D2D2D]/50">
            Showing {templates.length} of {total} templates
          </div>
        )}
      </div>
    </div>
  );
}
