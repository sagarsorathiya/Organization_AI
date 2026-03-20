import { useState, useEffect } from "react";
import { get, post, patch, del } from "@/api/client";
import type { Agent } from "@/types";
import {
  Bot, Plus, Trash2, Edit3, Save, X, Loader2, Copy,
  ToggleLeft, ToggleRight,
} from "lucide-react";
import { toast } from "sonner";

export function AgentsAdmin() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingAgent, setEditingAgent] = useState<Partial<Agent> | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    setIsLoading(true);
    try {
      const data = await get<{ agents: Agent[] }>("/admin/agents/stats");
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
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{isNew ? "New Agent" : "Edit Agent"}</h3>
          <button onClick={() => { setEditingAgent(null); setIsNew(false); }} className="btn-ghost p-2">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Name</label>
            <input
              value={editingAgent.name || ""}
              onChange={(e) => setEditingAgent({ ...editingAgent, name: e.target.value })}
              className="input-field text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Slug</label>
            <input
              value={editingAgent.slug || ""}
              onChange={(e) => setEditingAgent({ ...editingAgent, slug: e.target.value })}
              className="input-field text-sm"
              disabled={!isNew && editingAgent.is_system}
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Icon (emoji)</label>
            <input
              value={editingAgent.icon || ""}
              onChange={(e) => setEditingAgent({ ...editingAgent, icon: e.target.value })}
              className="input-field text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Category</label>
            <input
              value={editingAgent.category || ""}
              onChange={(e) => setEditingAgent({ ...editingAgent, category: e.target.value })}
              className="input-field text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Temperature</label>
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
            <label className="text-xs font-medium mb-1 block">Preferred Model</label>
            <input
              value={editingAgent.preferred_model || ""}
              onChange={(e) => setEditingAgent({ ...editingAgent, preferred_model: e.target.value })}
              className="input-field text-sm"
              placeholder="(uses default)"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block">Description</label>
          <textarea
            value={editingAgent.description || ""}
            onChange={(e) => setEditingAgent({ ...editingAgent, description: e.target.value })}
            className="input-field text-sm min-h-[60px]"
          />
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block">System Prompt</label>
          <textarea
            value={editingAgent.system_prompt || ""}
            onChange={(e) => setEditingAgent({ ...editingAgent, system_prompt: e.target.value })}
            className="input-field text-sm min-h-[120px]"
          />
        </div>

        <button onClick={handleSave} className="btn-primary flex items-center gap-2">
          <Save size={16} />
          {isNew ? "Create Agent" : "Save Changes"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Bot size={18} />
          AI Agents
        </h3>
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
            });
            setIsNew(true);
          }}
          className="btn-primary text-sm flex items-center gap-1"
        >
          <Plus size={14} />
          New Agent
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-surface-400" />
        </div>
      ) : (
        <div className="space-y-1">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800 group"
            >
              <span className="text-xl flex-shrink-0">{agent.icon || "🤖"}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{agent.name}</p>
                  {agent.is_system && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-100 dark:bg-surface-800 text-surface-500">
                      system
                    </span>
                  )}
                  {!agent.is_active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600">
                      disabled
                    </span>
                  )}
                </div>
                <p className="text-xs text-surface-500">
                  {agent.category} · {agent.usage_count} uses
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleToggle(agent)}
                  className="btn-ghost p-1"
                  title={agent.is_active ? "Disable" : "Enable"}
                >
                  {agent.is_active ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
                </button>
                <button
                  onClick={() => { setEditingAgent(agent); setIsNew(false); }}
                  className="btn-ghost p-1"
                  title="Edit"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  onClick={() => handleDuplicate(agent.id)}
                  className="btn-ghost p-1"
                  title="Duplicate"
                >
                  <Copy size={14} />
                </button>
                {!agent.is_system && (
                  <button
                    onClick={() => handleDelete(agent.id)}
                    className="btn-ghost p-1 text-red-500"
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
