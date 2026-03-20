import { useState, useEffect } from "react";
import { useMemoryStore } from "@/store/memoryStore";
import { Brain, Plus, Trash2, Edit3, Save, X, Loader2 } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";

export function MemoryPanel() {
  const { memories, isLoading, loadMemories, createMemory, updateMemory, deleteMemory } =
    useMemoryStore();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("fact");

  useEffect(() => {
    if (memories.length === 0) loadMemories();
  }, [memories.length, loadMemories]);

  const handleCreate = async () => {
    if (!newKey.trim() || !newContent.trim()) return;
    try {
      await createMemory({ key: newKey, content: newContent, category: newCategory });
      setShowCreate(false);
      setNewKey("");
      setNewContent("");
      toast.success("Memory created");
    } catch {
      toast.error("Failed to create memory");
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      await updateMemory(id, { content: editContent });
      setEditingId(null);
      toast.success("Memory updated");
    } catch {
      toast.error("Failed to update memory");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMemory(id);
      toast.success("Memory deleted");
    } catch {
      toast.error("Failed to delete memory");
    }
  };

  const categoryColors: Record<string, string> = {
    preference: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    fact: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    context: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    skill: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold flex items-center gap-2">
          <Brain size={18} />
          AI Memory
        </h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="btn-ghost p-1.5"
          title="Add memory"
        >
          <Plus size={16} />
        </button>
      </div>

      {showCreate && (
        <div className="p-4 border-b space-y-2">
          <input
            type="text"
            placeholder="Key (e.g., preferred_language)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="input-field text-sm"
          />
          <textarea
            placeholder="Content..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            className="input-field text-sm min-h-[60px]"
          />
          <div className="flex items-center gap-2">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="input-field text-sm flex-1"
            >
              <option value="fact">Fact</option>
              <option value="preference">Preference</option>
              <option value="context">Context</option>
              <option value="skill">Skill</option>
            </select>
            <button onClick={handleCreate} className="btn-primary text-sm px-3 py-1.5">
              <Save size={14} />
            </button>
            <button onClick={() => setShowCreate(false)} className="btn-ghost text-sm px-3 py-1.5">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-surface-400" />
          </div>
        ) : memories.length === 0 ? (
          <div className="text-center py-8">
            <Brain size={32} className="mx-auto text-surface-300 mb-2" />
            <p className="text-sm text-surface-500">No memories yet</p>
            <p className="text-xs text-surface-400 mt-1">
              The AI will remember context from your conversations
            </p>
          </div>
        ) : (
          memories.map((mem) => (
            <div
              key={mem.id}
              className="p-3 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/50 mb-1 group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{mem.key}</span>
                    <span
                      className={clsx(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                        categoryColors[mem.category] || "bg-surface-100 text-surface-600"
                      )}
                    >
                      {mem.category}
                    </span>
                  </div>
                  {editingId === mem.id ? (
                    <div className="flex gap-1 mt-1">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="input-field text-xs flex-1 min-h-[40px]"
                      />
                      <button
                        onClick={() => handleUpdate(mem.id)}
                        className="btn-ghost p-1"
                      >
                        <Save size={12} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="btn-ghost p-1"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-surface-600 dark:text-surface-400">
                      {mem.content}
                    </p>
                  )}
                </div>
                {editingId !== mem.id && (
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setEditingId(mem.id);
                        setEditContent(mem.content);
                      }}
                      className="btn-ghost p-1"
                      title="Edit"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      onClick={() => handleDelete(mem.id)}
                      className="btn-ghost p-1 text-red-500"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-surface-400">
                  {mem.scope} · accessed {mem.access_count}x
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
