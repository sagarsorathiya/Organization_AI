import { create } from "zustand";
import type { PromptTemplate, TemplateCategory } from "@/types";
import { get, post, del } from "@/api/client";

interface TemplateState {
  templates: PromptTemplate[];
  categories: TemplateCategory[];
  isLoading: boolean;
  loadTemplates: (category?: string) => Promise<void>;
  loadCategories: () => Promise<void>;
  useTemplate: (id: string) => Promise<string>;
}

export const useTemplateStore = create<TemplateState>((set) => ({
  templates: [],
  categories: [],
  isLoading: false,

  loadTemplates: async (category?: string) => {
    set({ isLoading: true });
    try {
      const url = category ? `/templates?category=${encodeURIComponent(category)}` : "/templates";
      const data = await get<PromptTemplate[]>(url);
      set({ templates: data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  loadCategories: async () => {
    try {
      const data = await get<TemplateCategory[]>("/templates/categories");
      set({ categories: data });
    } catch {
      // silent
    }
  },

  useTemplate: async (id: string) => {
    const data = await post<{ content: string }>(`/templates/use/${id}`);
    return data.content;
  },
}));
