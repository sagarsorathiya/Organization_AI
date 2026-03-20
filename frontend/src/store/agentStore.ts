import { create } from "zustand";
import type { Agent } from "@/types";
import { get } from "@/api/client";

interface AgentState {
  agents: Agent[];
  selectedAgent: Agent | null;
  isLoading: boolean;

  loadAgents: () => Promise<void>;
  selectAgent: (agent: Agent | null) => void;
  getAgentBySlug: (slug: string) => Agent | undefined;
}

export const useAgentStore = create<AgentState>((set, getState) => ({
  agents: [],
  selectedAgent: null,
  isLoading: false,

  loadAgents: async () => {
    set({ isLoading: true });
    try {
      const data = await get<{ agents: Agent[] }>("/agents");
      set({ agents: data.agents, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  selectAgent: (agent) => set({ selectedAgent: agent }),

  getAgentBySlug: (slug) => {
    return getState().agents.find((a) => a.slug === slug);
  },
}));
