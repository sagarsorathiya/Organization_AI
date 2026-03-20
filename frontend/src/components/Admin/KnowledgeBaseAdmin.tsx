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
      toast.success("Documents uploaded and processing");
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
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSelectedKb(null);
              setDocs([]);
              setSearchResults([]);
            }}
            className="btn-ghost p-2"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h3 className="font-semibold">{selectedKb.name}</h3>
            <p className="text-xs text-surface-500">
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
          <h4 className="text-sm font-medium mb-2">Documents</h4>
          {docs.length === 0 ? (
            <p className="text-sm text-surface-500 text-center py-4">No documents yet</p>
          ) : (
            docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800"
              >
                <FileText size={18} className="text-surface-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{doc.title}</p>
                  <p className="text-xs text-surface-500">
                    {doc.file_type} · {doc.chunk_count} chunks ·{" "}
                    <span
                      className={clsx(
                        doc.status === "ready" && "text-green-600",
                        doc.status === "failed" && "text-red-600",
                        doc.status === "processing" && "text-amber-600"
                      )}
                    >
                      {doc.status}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteDoc(doc.id)}
                  className="btn-ghost p-1 text-red-500 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Database size={18} />
          Knowledge Bases
        </h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="btn-primary text-sm flex items-center gap-1"
        >
          <Plus size={14} />
          New
        </button>
      </div>

      {showCreate && (
        <div className="card p-4 space-y-3">
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
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-surface-400" />
        </div>
      ) : kbs.length === 0 ? (
        <div className="text-center py-8">
          <Database size={32} className="mx-auto text-surface-300 mb-2" />
          <p className="text-sm text-surface-500">No knowledge bases yet</p>
        </div>
      ) : (
        <div className="space-y-1">
          {kbs.map((kb) => (
            <div
              key={kb.id}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800 cursor-pointer group"
              onClick={() => {
                setSelectedKb(kb);
                loadDocs(kb.id);
              }}
            >
              <Database size={18} className="text-primary-500 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{kb.name}</p>
                <p className="text-xs text-surface-500">
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
                  className="btn-ghost p-1 text-red-500 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
                <ChevronRight size={16} className="text-surface-400" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
