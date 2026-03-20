import { create } from "zustand";
import type { AgentSkill, SkillExecution } from "@/types";
import { get, post } from "@/api/client";

interface SkillState {
  skills: AgentSkill[];
  executions: SkillExecution[];
  isLoading: boolean;
  isExecuting: boolean;
  lastResult: SkillExecution | null;

  loadSkills: () => Promise<void>;
  executeSkill: (slug: string, inputs: Record<string, string>) => Promise<SkillExecution | null>;
  loadExecutions: () => Promise<void>;
  clearResult: () => void;
}

export const useSkillStore = create<SkillState>((set) => ({
  skills: [],
  executions: [],
  isLoading: false,
  isExecuting: false,
  lastResult: null,

  loadSkills: async () => {
    set({ isLoading: true });
    try {
      const data = await get<{ skills: AgentSkill[] }>("/skills");
      set({ skills: data.skills, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  executeSkill: async (slug, inputs) => {
    set({ isExecuting: true, lastResult: null });
    try {
      const result = await post<SkillExecution>(`/skills/${slug}/execute`, { inputs });
      set({ isExecuting: false, lastResult: result });
      return result;
    } catch {
      set({ isExecuting: false });
      return null;
    }
  },

  loadExecutions: async () => {
    try {
      const data = await get<{ executions: SkillExecution[] }>("/skills/executions");
      set({ executions: data.executions });
    } catch {
      // silently fail
    }
  },

  clearResult: () => set({ lastResult: null }),
}));
