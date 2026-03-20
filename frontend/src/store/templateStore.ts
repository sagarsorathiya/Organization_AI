import { create } from "zustand";
import type { PromptTemplate, TemplateCategory } from "@/types";
import { get, post } from "@/api/client";

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
      const data = await get<{ templates: PromptTemplate[] } | PromptTemplate[]>(url);
      const list = Array.isArray(data) ? data : data.templates ?? [];
      set({ templates: list, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  loadCategories: async () => {
    try {
      const data = await get<{ categories: TemplateCategory[] } | TemplateCategory[]>("/templates/categories");
      const list = Array.isArray(data) ? data : data.categories ?? [];
      set({ categories: list });
    } catch {
      // silent
    }
  },

  useTemplate: async (id: string) => {
    const data = await post<{ content: string }>(`/templates/use/${id}`);
    return data.content;
  },
}));
