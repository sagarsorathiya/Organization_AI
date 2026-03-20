import { create } from "zustand";
import type { AIMemory } from "@/types";
import { get, post, patch, del } from "@/api/client";

interface MemoryState {
  memories: AIMemory[];
  isLoading: boolean;

  loadMemories: () => Promise<void>;
  createMemory: (data: { key: string; content: string; category?: string; scope?: string }) => Promise<void>;
  updateMemory: (id: string, data: { content: string }) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
}

export const useMemoryStore = create<MemoryState>((set) => ({
  memories: [],
  isLoading: false,

  loadMemories: async () => {
    set({ isLoading: true });
    try {
      const data = await get<{ memories: AIMemory[] }>("/memory");
      set({ memories: data.memories, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createMemory: async (memData) => {
    const created = await post<AIMemory>("/memory", memData);
    set((s) => ({ memories: [created, ...s.memories] }));
  },

  updateMemory: async (id, memData) => {
    const updated = await patch<AIMemory>(`/memory/${id}`, memData);
    set((s) => ({
      memories: s.memories.map((m) => (m.id === id ? updated : m)),
    }));
  },

  deleteMemory: async (id) => {
    await del(`/memory/${id}`);
    set((s) => ({ memories: s.memories.filter((m) => m.id !== id) }));
  },
}));
