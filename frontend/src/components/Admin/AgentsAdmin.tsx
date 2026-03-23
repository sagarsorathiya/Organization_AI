import { useState, useEffect } from "react";
import { get, post, patch, del } from "@/api/client";
import type { Agent, KnowledgeBase } from "@/types";
import {
  Bot, Plus, Trash2, Edit3, Save, X, Loader2, Copy,
  ToggleLeft, ToggleRight,
} from "lucide-react";
import { toast } from "sonner";

export function AgentsAdmin() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingAgent, setEditingAgent] = useState<Partial<Agent> | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    loadAgents();
    loadKnowledgeBases();
  }, []);

  const loadAgents = async () => {
    setIsLoading(true);
    try {
      const data = await get<{ agents: Agent[] }>("/admin/agents");
      setAgents(data.agents || []);
    } catch {
      // Fallback to user endpoint
      try {
        const data = await get<{ agents: Agent[] }>("/agents");
        setAgents(data.agents);
      } catch {
        toast.error("Failed to load agents");
      }
    }
    setIsLoading(false);
  };

  const loadKnowledgeBases = async () => {
    try {
      const data = await get<{ knowledge_bases?: KnowledgeBase[]; items?: KnowledgeBase[] }>("/admin/knowledge-bases");
      setKnowledgeBases(data.knowledge_bases || data.items || []);
    } catch {
      setKnowledgeBases([]);
    }
  };

  const handleSave = async () => {
    if (!editingAgent?.name || !editingAgent?.slug || !editingAgent?.system_prompt) {
      toast.error("Name, slug, and system prompt are required");
      return;
    }
    try {
      if (isNew) {
        const created = await post<Agent>("/admin/agents", editingAgent);
        setAgents((prev) => [created, ...prev]);
        toast.success("Agent created");
      } else if (editingAgent.id) {
        const updated = await patch<Agent>(`/admin/agents/${editingAgent.id}`, editingAgent);
        setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        toast.success("Agent updated");
      }
      setEditingAgent(null);
      setIsNew(false);
    } catch {
      toast.error("Failed to save agent");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this agent?")) return;
    try {
      await del(`/admin/agents/${id}`);
      setAgents((prev) => prev.filter((a) => a.id !== id));
      toast.success("Agent deleted");
    } catch {
      toast.error("Failed to delete agent");
    }
  };

  const handleToggle = async (agent: Agent) => {
    try {
      await patch(`/admin/agents/${agent.id}/active`, { is_active: !agent.is_active });
      setAgents((prev) =>
        prev.map((a) => (a.id === agent.id ? { ...a, is_active: !a.is_active } : a))
      );
    } catch {
      toast.error("Failed to toggle agent");
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const dup = await post<Agent>(`/admin/agents/${id}/duplicate`, {});
      setAgents((prev) => [dup, ...prev]);
      toast.success("Agent duplicated");
    } catch {
      toast.error("Failed to duplicate agent");
    }
  };

  if (editingAgent) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200">{isNew ? "Create New Agent" : "Edit Agent"}</h3>
          <button onClick={() => { setEditingAgent(null); setIsNew(false); }} className="btn-ghost p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Basic Info</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block text-surface-600 dark:text-surface-300">Name</label>
              <input
                value={editingAgent.name || ""}
                onChange={(e) => setEditingAgent({ ...editingAgent, name: e.target.value })}
                className="input-field text-sm"
                placeholder="Agent name"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block text-surface-600 dark:text-surface-300">Slug</label>
              <input
                value={editingAgent.slug || ""}
                onChange={(e) => setEditingAgent({ ...editingAgent, slug: e.target.value })}
                className="input-field text-sm"
                disabled={!isNew && editingAgent.is_system}
                placeholder="agent-slug"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block text-surface-600 dark:text-surface-300">Icon (emoji)</label>
              <input
                value={editingAgent.icon || ""}
                onChange={(e) => setEditingAgent({ ...editingAgent, icon: e.target.value })}
                className="input-field text-sm"
                placeholder="🤖"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block text-surface-600 dark:text-surface-300">Category</label>
              <input
                value={editingAgent.category || ""}
                onChange={(e) => setEditingAgent({ ...editingAgent, category: e.target.value })}
                className="input-field text-sm"
                placeholder="e.g. Writing, Analysis"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Model Settings</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block text-surface-600 dark:text-surface-300">Temperature</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={editingAgent.temperature ?? 0.7}
                onChange={(e) => setEditingAgent({ ...editingAgent, temperature: parseFloat(e.target.value) })}
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block text-surface-600 dark:text-surface-300">Preferred Model</label>
              <input
                value={editingAgent.preferred_model || ""}
                onChange={(e) => setEditingAgent({ ...editingAgent, preferred_model: e.target.value })}
                className="input-field text-sm"
                placeholder="(uses default)"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium mb-1 block text-surface-600 dark:text-surface-300">Knowledge Base</label>
              <div className="rounded-lg border border-surface-200 dark:border-surface-700 p-2 max-h-40 overflow-auto space-y-2">
                {knowledgeBases.length === 0 ? (
                  <p className="text-xs text-surface-500">No knowledge bases available</p>
                ) : (
                  knowledgeBases.map((kb) => {
                    const selected = (editingAgent.knowledge_base_ids || []).includes(kb.id);
                    return (
                      <label key={kb.id} className="flex items-center gap-2 text-sm text-surface-700 dark:text-surface-200">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => {
                            const current = editingAgent.knowledge_base_ids || [];
                            const next = e.target.checked
                              ? [...current, kb.id]
                              : current.filter((id) => id !== kb.id);
                            setEditingAgent({
                              ...editingAgent,
                              knowledge_base_ids: next,
                              knowledge_base_id: next.length > 0 ? next[0] : null,
                            });
                          }}
                        />
                        <span>{kb.name} ({kb.document_count} docs)</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block text-surface-600 dark:text-surface-300">Description</label>
          <textarea
            value={editingAgent.description || ""}
            onChange={(e) => setEditingAgent({ ...editingAgent, description: e.target.value })}
            className="input-field text-sm min-h-[60px]"
            placeholder="Brief description of what this agent does"
          />
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block text-surface-600 dark:text-surface-300">System Prompt</label>
          <textarea
            value={editingAgent.system_prompt || ""}
            onChange={(e) => setEditingAgent({ ...editingAgent, system_prompt: e.target.value })}
            className="input-field text-sm min-h-[120px] font-mono"
            placeholder="System prompt that defines the agent's behavior..."
          />
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-surface-100 dark:border-surface-800">
          <button onClick={handleSave} className="btn-primary flex items-center gap-2">
            <Save size={16} />
            {isNew ? "Create Agent" : "Save Changes"}
          </button>
          <button onClick={() => { setEditingAgent(null); setIsNew(false); }} className="btn-ghost text-sm">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-surface-500">{agents.length} agent{agents.length !== 1 ? "s" : ""}</p>
        <button
          onClick={() => {
            setEditingAgent({
              name: "",
              slug: "",
              description: "",
              icon: "🤖",
              category: "",
              system_prompt: "",
              temperature: 0.7,
              knowledge_base_id: null,
              knowledge_base_ids: [],
            });
            setIsNew(true);
          }}
          className="btn-primary text-sm flex items-center gap-1.5"
        >
          <Plus size={14} />
          New Agent
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-surface-400" />
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-12">
          <Bot size={36} className="mx-auto text-surface-300 dark:text-surface-600 mb-3" />
          <p className="text-sm font-medium text-surface-500">No agents configured</p>
          <p className="text-xs text-surface-400 mt-1">Create your first AI agent to get started</p>
        </div>
      ) : (
        <div className="divide-y divide-surface-100 dark:divide-surface-800">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-3 py-3 px-1 group"
            >
              <div className="w-9 h-9 rounded-lg bg-surface-50 dark:bg-surface-800 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">{agent.icon || "🤖"}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-surface-800 dark:text-surface-100">{agent.name}</p>
                  {agent.is_system && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium">
                      system
                    </span>
                  )}
                  {!agent.is_active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-medium">
                      disabled
                    </span>
                  )}
                </div>
                <p className="text-xs text-surface-400 mt-0.5">
                  {agent.category}{agent.category ? " · " : ""}{agent.usage_count} uses
                </p>
                {(agent.knowledge_base_id || (agent.knowledge_base_ids && agent.knowledge_base_ids.length > 0)) && (
                  <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">
                    KB linked ({(agent.knowledge_base_ids || (agent.knowledge_base_id ? [agent.knowledge_base_id] : [])).length})
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleToggle(agent)}
                  className="btn-ghost p-1.5 rounded-md"
                  title={agent.is_active ? "Disable" : "Enable"}
                >
                  {agent.is_active ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
                </button>
                <button
                  onClick={() => {
                    const normalizedKbIds = agent.knowledge_base_ids || (agent.knowledge_base_id ? [agent.knowledge_base_id] : []);
                    setEditingAgent({ ...agent, knowledge_base_ids: normalizedKbIds });
                    setIsNew(false);
                  }}
                  className="btn-ghost p-1.5 rounded-md"
                  title="Edit"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  onClick={() => handleDuplicate(agent.id)}
                  className="btn-ghost p-1.5 rounded-md"
                  title="Duplicate"
                >
                  <Copy size={14} />
                </button>
                {!agent.is_system && (
                  <button
                    onClick={() => handleDelete(agent.id)}
                    className="btn-ghost p-1.5 rounded-md text-red-500"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
