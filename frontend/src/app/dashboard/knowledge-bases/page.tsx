"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Plus,
  Search,
  Trash2,
  BookOpen,
  Upload,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  ChevronLeft,
} from "lucide-react";
import { api } from "@/lib/api";
import type {
  KnowledgeBase,
  KnowledgeDocument,
  KnowledgeSearchResult,
} from "@/types/dashboard";

// Placeholder org ID — in production this comes from user context
const ORG_ID = "00000000-0000-0000-0000-000000000001";

type View = "list" | "detail";

export default function KnowledgeBasesPage() {
  const [view, setView] = useState<View>("list");
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Detail view
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const loadKbs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getKnowledgeBases(ORG_ID);
      setKbs(data.items);
      setTotal(data.total);
    } catch {
      setKbs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKbs();
  }, [loadKbs]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      await api.createKnowledgeBase({
        name: createName,
        description: createDesc || undefined,
        org_id: ORG_ID,
      });
      setShowCreate(false);
      setCreateName("");
      setCreateDesc("");
      loadKbs();
    } catch (err) {
      console.error("Failed to create knowledge base:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this knowledge base and all its documents?")) return;
    try {
      await api.deleteKnowledgeBase(id, ORG_ID);
      if (selectedKb?.id === id) {
        setView("list");
        setSelectedKb(null);
      }
      loadKbs();
    } catch (err) {
      console.error("Failed to delete knowledge base:", err);
    }
  };

  const openDetail = async (kb: KnowledgeBase) => {
    setSelectedKb(kb);
    setView("detail");
    setDocsLoading(true);
    setSearchResults([]);
    setSearchQuery("");
    try {
      const data = await api.getKBDocuments(kb.id, ORG_ID);
      setDocuments(data.items);
    } catch {
      setDocuments([]);
    } finally {
      setDocsLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedKb) return;
    setUploading(true);
    try {
      await api.uploadKBDocument(selectedKb.id, ORG_ID, file);
      const data = await api.getKBDocuments(selectedKb.id, ORG_ID);
      setDocuments(data.items);
      loadKbs();
    } catch (err) {
      console.error("Failed to upload document:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!selectedKb) return;
    if (!confirm("Delete this document?")) return;
    try {
      await api.deleteKBDocument(selectedKb.id, docId, ORG_ID);
      const data = await api.getKBDocuments(selectedKb.id, ORG_ID);
      setDocuments(data.items);
      loadKbs();
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !selectedKb) return;
    setSearching(true);
    try {
      const data = await api.searchKnowledgeBase(selectedKb.id, ORG_ID, searchQuery);
      setSearchResults(data.results);
    } catch (err) {
      console.error("Search failed:", err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const filteredKbs = kbs.filter(
    (kb) =>
      kb.name.toLowerCase().includes(search.toLowerCase()) ||
      (kb.description || "").toLowerCase().includes(search.toLowerCase()),
  );

  // ---------------------------------------------------------------------------
  // Detail View
  // ---------------------------------------------------------------------------

  if (view === "detail" && selectedKb) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setView("list");
              setSelectedKb(null);
            }}
            className="p-2 rounded-lg hover:bg-[#FF6B6B]/10 text-[#2D2D2D]/60 hover:text-[#FF6B6B] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-[#2D2D2D]">{selectedKb.name}</h2>
            {selectedKb.description && (
              <p className="text-sm text-[#2D2D2D]/50">{selectedKb.description}</p>
            )}
          </div>
        </div>

        {/* Upload & Documents */}
        <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-[#2D2D2D]">Documents</h3>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                onChange={handleUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 bg-[#FF6B6B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#ff5252] transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Upload Document
              </button>
            </div>
          </div>

          {docsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#FF6B6B]" />
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <div className="w-14 h-14 rounded-full bg-[#FFF8F0] flex items-center justify-center">
                <FileText className="w-7 h-7 text-[#FF6B6B]/40" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-[#2D2D2D]/60">No documents yet</p>
                <p className="text-xs text-[#2D2D2D]/40 mt-1">
                  Upload PDF or text files to build your knowledge base
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between px-4 py-3 bg-[#FFF8F0]/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-[#FF6B6B]/60" />
                    <div>
                      <p className="text-sm font-medium text-[#2D2D2D]">{doc.file_name}</p>
                      <p className="text-xs text-[#2D2D2D]/40">
                        {doc.chunk_count} chunks &middot; {doc.file_type.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {doc.status === "ready" && (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Ready
                      </span>
                    )}
                    {doc.status === "processing" && (
                      <span className="flex items-center gap-1 text-xs text-amber-600">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Processing
                      </span>
                    )}
                    {doc.status === "error" && (
                      <span
                        className="flex items-center gap-1 text-xs text-red-600"
                        title={doc.error_message || "Processing failed"}
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        Error
                      </span>
                    )}
                    {doc.status === "pending" && (
                      <span className="flex items-center gap-1 text-xs text-[#2D2D2D]/40">
                        <Loader2 className="w-3.5 h-3.5" />
                        Pending
                      </span>
                    )}
                    <button
                      onClick={() => handleDeleteDoc(doc.id)}
                      className="p-1.5 rounded-lg hover:bg-[#FF6B6B]/10 text-[#2D2D2D]/40 hover:text-[#FF6B6B] transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Search / Test Retrieval */}
        <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-6">
          <h3 className="text-sm font-medium text-[#2D2D2D] mb-4">Test Retrieval</h3>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Ask a question to test RAG retrieval..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1 px-4 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40 focus:border-transparent"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="flex items-center gap-2 bg-[#FF6B6B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#ff5252] transition-colors disabled:opacity-50"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-3">
              {searchResults.map((result, idx) => (
                <div key={result.chunk_id} className="p-4 bg-[#FFF8F0]/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-[#FF6B6B]">
                      #{idx + 1} &middot; {result.file_name}
                    </span>
                    <span className="text-xs text-[#2D2D2D]/40">
                      Score: {(result.score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-sm text-[#2D2D2D]/80 whitespace-pre-wrap">{result.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // List View
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2D2D2D]/40" />
          <input
            type="text"
            placeholder="Search knowledge bases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40 focus:border-transparent"
          />
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto flex items-center gap-2 bg-[#FF6B6B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#ff5252] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Knowledge Base
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl border border-[#FF6B6B]/15 shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#2D2D2D]">Create Knowledge Base</h3>
              <button onClick={() => setShowCreate(false)} className="text-[#2D2D2D]/40 hover:text-[#2D2D2D]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#2D2D2D]/70 mb-1">Name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Product FAQs"
                  className="w-full px-4 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#2D2D2D]/70 mb-1">Description (optional)</label>
                <textarea
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder="What kind of knowledge does this base contain?"
                  rows={3}
                  className="w-full px-4 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm font-medium text-[#2D2D2D]/60 hover:text-[#2D2D2D] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !createName.trim()}
                  className="flex items-center gap-2 bg-[#FF6B6B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#ff5252] transition-colors disabled:opacity-50"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Knowledge Bases Grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#FF6B6B]" />
        </div>
      ) : filteredKbs.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#FF6B6B]/15 flex flex-col items-center gap-3 py-16">
          <div className="w-14 h-14 rounded-full bg-[#FFF8F0] flex items-center justify-center">
            <BookOpen className="w-7 h-7 text-[#FF6B6B]/40" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[#2D2D2D]/60">No knowledge bases yet</p>
            <p className="text-xs text-[#2D2D2D]/40 mt-1">
              Create a knowledge base to give your AI agent business-specific context
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-2 flex items-center gap-1.5 bg-[#FF6B6B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#ff5252] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Knowledge Base
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredKbs.map((kb) => (
            <div
              key={kb.id}
              onClick={() => openDetail(kb)}
              className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5 cursor-pointer hover:shadow-md hover:border-[#FF6B6B]/30 transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-[#FF6B6B]/10 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-[#FF6B6B]" />
                  </div>
                  <h3 className="text-sm font-semibold text-[#2D2D2D] group-hover:text-[#FF6B6B] transition-colors">
                    {kb.name}
                  </h3>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(kb.id);
                  }}
                  className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-[#FF6B6B]/10 text-[#2D2D2D]/40 hover:text-[#FF6B6B] transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {kb.description && (
                <p className="text-xs text-[#2D2D2D]/50 mb-3 line-clamp-2">{kb.description}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-[#2D2D2D]/40">
                <span className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  {kb.document_count} document{kb.document_count !== 1 ? "s" : ""}
                </span>
                <span>
                  Updated {new Date(kb.updated_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > 0 && (
        <p className="text-xs text-[#2D2D2D]/50">
          Showing {filteredKbs.length} of {total} knowledge bases
        </p>
      )}
    </div>
  );
}
