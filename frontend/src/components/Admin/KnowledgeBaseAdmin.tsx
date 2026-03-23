import { useState, useEffect, useRef } from "react";
import { get, post, del } from "@/api/client";
import type { KnowledgeBase, KnowledgeDocument } from "@/types";
import {
  Database, Plus, Trash2, Upload, FileText, RefreshCw,
  Search, Loader2, ChevronRight, ArrowLeft,
} from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";

export function KnowledgeBaseAdmin() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);
  const [docs, setDocs] = useState<KnowledgeDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDept, setNewDept] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadKbs();
  }, []);

  const loadKbs = async () => {
    setIsLoading(true);
    try {
      const data = await get<{ knowledge_bases: KnowledgeBase[] }>("/admin/knowledge-bases");
      setKbs(data.knowledge_bases);
    } catch {
      toast.error("Failed to load knowledge bases");
    }
    setIsLoading(false);
  };

  const loadDocs = async (kbId: string) => {
    try {
      const data = await get<{ documents: KnowledgeDocument[] }>(
        `/admin/knowledge-bases/${kbId}/documents`
      );
      setDocs(data.documents);
    } catch {
      toast.error("Failed to load documents");
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const created = await post<KnowledgeBase>("/admin/knowledge-bases", {
        name: newName,
        description: newDesc || null,
        department: newDept || null,
      });
      setKbs((prev) => [created, ...prev]);
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      setNewDept("");
      toast.success("Knowledge base created");
    } catch {
      toast.error("Failed to create knowledge base");
    }
  };

  const handleDelete = async (kbId: string) => {
    if (!confirm("Delete this knowledge base and all its documents?")) return;
    try {
      await del(`/admin/knowledge-bases/${kbId}`);
      setKbs((prev) => prev.filter((kb) => kb.id !== kbId));
      if (selectedKb?.id === kbId) setSelectedKb(null);
      toast.success("Knowledge base deleted");
    } catch {
      toast.error("Failed to delete knowledge base");
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedKb || !e.target.files?.length) return;
    setIsUploading(true);
    const formData = new FormData();
    Array.from(e.target.files).forEach((f) => formData.append("files", f));

    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(
        `/api/admin/knowledge-bases/${selectedKb.id}/documents`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "include",
          body: formData,
        }
      );
      if (!res.ok) throw new Error("Upload failed");

      const payload = await res.json().catch(() => ({ documents: [] as unknown[] }));
      const uploaded = Array.isArray(payload?.documents) ? payload.documents : [];
      const failed = uploaded.filter((d: unknown) => {
        const item = d as { error?: string; status?: string };
        return Boolean(item.error) || item.status === "failed";
      }).length;
      const succeeded = Math.max(uploaded.length - failed, 0);

      if (failed === 0) {
        toast.success(`Uploaded ${succeeded} document${succeeded === 1 ? "" : "s"}`);
      } else if (succeeded > 0) {
        toast.warning(`Uploaded ${succeeded}, failed ${failed}. Check document statuses.`);
      } else {
        toast.error("Upload failed for all selected files");
      }

      await loadDocs(selectedKb.id);
    } catch {
      toast.error("Failed to upload documents");
    }
    setIsUploading(false);
    e.target.value = "";
  };

  const handleSync = async () => {
    if (!selectedKb) return;
    try {
      await post(`/admin/knowledge-bases/${selectedKb.id}/sync`, {});
      toast.success("Sync started");
      await loadDocs(selectedKb.id);
    } catch {
      toast.error("Failed to sync");
    }
  };

  const handleSearch = async () => {
    if (!selectedKb || !searchQuery.trim()) return;
    try {
      const data = await get<{ results: { content: string; score: number }[] }>(
        `/admin/knowledge-bases/${selectedKb.id}/search?query=${encodeURIComponent(searchQuery)}`
      );
      setSearchResults(data.results.map((r) => `[${r.score.toFixed(2)}] ${r.content}`));
    } catch {
      toast.error("Search failed");
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!selectedKb) return;
    try {
      await del(`/admin/knowledge-bases/${selectedKb.id}/documents/${docId}`);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      toast.success("Document deleted");
    } catch {
      toast.error("Failed to delete document");
    }
  };

  // Detail view
  if (selectedKb) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSelectedKb(null);
              setDocs([]);
              setSearchResults([]);
            }}
            className="btn-ghost p-1.5 rounded-md"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-100">{selectedKb.name}</h3>
            <p className="text-xs text-surface-400">
              {selectedKb.document_count} documents · {selectedKb.total_chunks} chunks
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,.csv,.json,.xml,.html,.xlsx,.pptx"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="btn-primary text-sm flex items-center gap-1"
          >
            {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Upload Documents
          </button>
          <button onClick={handleSync} className="btn-ghost text-sm flex items-center gap-1">
            <RefreshCw size={14} />
            Re-sync All
          </button>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search knowledge base..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="input-field text-sm flex-1"
          />
          <button onClick={handleSearch} className="btn-ghost p-2">
            <Search size={16} />
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="card p-3 space-y-2">
            <h4 className="text-sm font-medium">Search Results</h4>
            {searchResults.map((r, i) => (
              <p key={i} className="text-xs text-surface-600 dark:text-surface-400 p-2 bg-surface-50 dark:bg-surface-800 rounded">
                {r}
              </p>
            ))}
          </div>
        )}

        {/* Documents */}
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">Documents</h4>
          {docs.length === 0 ? (
            <div className="text-center py-8">
              <FileText size={28} className="mx-auto text-surface-300 dark:text-surface-600 mb-2" />
              <p className="text-sm text-surface-500">No documents yet</p>
              <p className="text-xs text-surface-400 mt-1">Upload files to populate this knowledge base</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-100 dark:divide-surface-800">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 py-3 px-1 group"
                >
                  <FileText size={16} className="text-surface-400 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate text-surface-800 dark:text-surface-100">{doc.title}</p>
                    <p className="text-xs text-surface-400 mt-0.5">
                      {doc.file_type} · {doc.chunk_count} chunks ·{" "}
                      <span
                        className={clsx(
                          "font-medium",
                          doc.status === "ready" && "text-green-600 dark:text-green-400",
                          doc.status === "failed" && "text-red-600 dark:text-red-400",
                          doc.status === "processing" && "text-amber-600 dark:text-amber-400"
                        )}
                      >
                        {doc.status}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteDoc(doc.id)}
                    className="btn-ghost p-1.5 rounded-md text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            }
            </div>
          )}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-surface-500">{kbs.length} knowledge base{kbs.length !== 1 ? "s" : ""}</p>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="btn-primary text-sm flex items-center gap-1.5"
        >
          <Plus size={14} />
          New
        </button>
      </div>

      {showCreate && (
        <div className="rounded-lg border border-surface-200 dark:border-surface-700 p-4 space-y-3 bg-surface-50 dark:bg-surface-850">
          <input
            type="text"
            placeholder="Knowledge base name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="input-field text-sm"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="input-field text-sm"
          />
          <input
            type="text"
            placeholder="Department (optional)"
            value={newDept}
            onChange={(e) => setNewDept(e.target.value)}
            className="input-field text-sm"
          />
          <div className="flex gap-2">
            <button onClick={handleCreate} className="btn-primary text-sm">
              Create
            </button>
            <button onClick={() => setShowCreate(false)} className="btn-ghost text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-surface-400" />
        </div>
      ) : kbs.length === 0 ? (
        <div className="text-center py-12">
          <Database size={36} className="mx-auto text-surface-300 dark:text-surface-600 mb-3" />
          <p className="text-sm font-medium text-surface-500">No knowledge bases yet</p>
          <p className="text-xs text-surface-400 mt-1">Create a knowledge base and upload documents for RAG</p>
        </div>
      ) : (
        <div className="divide-y divide-surface-100 dark:divide-surface-800">
          {kbs.map((kb) => (
            <div
              key={kb.id}
              className="flex items-center gap-3 py-3 px-1 cursor-pointer group"
              onClick={() => {
                setSelectedKb(kb);
                loadDocs(kb.id);
              }}
            >
              <div className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0">
                <Database size={16} className="text-primary-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-surface-800 dark:text-surface-100">{kb.name}</p>
                <p className="text-xs text-surface-400 mt-0.5">
                  {kb.document_count} docs · {kb.total_chunks} chunks
                  {kb.department && ` · ${kb.department}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(kb.id);
                  }}
                  className="btn-ghost p-1.5 rounded-md text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={14} />
                </button>
                <ChevronRight size={16} className="text-surface-300" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
