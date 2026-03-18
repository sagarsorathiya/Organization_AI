import { useState, useEffect } from "react";
import { useTemplateStore } from "@/store/templateStore";
import { BookTemplate, X } from "lucide-react";

interface Props {
  onSelect: (content: string) => void;
}

export function TemplateSelector({ onSelect }: Props) {
  const { templates, categories, isLoading, loadTemplates, loadCategories, useTemplate } = useTemplateStore();
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    if (open && templates.length === 0) {
      loadTemplates();
      loadCategories();
    }
  }, [open, templates.length, loadTemplates, loadCategories]);

  const handleUse = async (id: string) => {
    const content = await useTemplate(id);
    onSelect(content);
    setOpen(false);
  };

  const handleCategoryFilter = (cat: string | null) => {
    setSelectedCategory(cat);
    loadTemplates(cat || undefined);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-xl text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors shrink-0"
        aria-label="Prompt templates"
        title="Browse prompt templates"
      >
        <BookTemplate size={18} />
      </button>
    );
  }

  return (
    <div className="absolute bottom-full left-0 mb-2 w-80 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl shadow-xl z-30 max-h-80 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-200 dark:border-surface-700">
        <span className="text-sm font-medium text-surface-700 dark:text-surface-200">Prompt Templates</span>
        <button onClick={() => setOpen(false)} className="p-0.5 rounded hover:bg-surface-100 dark:hover:bg-surface-700">
          <X size={14} className="text-surface-400" />
        </button>
      </div>

      {categories.length > 0 && (
        <div className="flex gap-1 px-3 py-2 border-b border-surface-100 dark:border-surface-700 overflow-x-auto">
          <button
            onClick={() => handleCategoryFilter(null)}
            className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${!selectedCategory ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300" : "text-surface-500 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700"}`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.category}
              onClick={() => handleCategoryFilter(c.category)}
              className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${selectedCategory === c.category ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300" : "text-surface-500 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700"}`}
            >
              {c.category} ({c.count})
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="text-center text-xs text-surface-400 py-4">Loading...</div>
        ) : templates.length === 0 ? (
          <div className="text-center text-xs text-surface-400 py-4">No templates available</div>
        ) : (
          templates.map((t) => (
            <button
              key={t.id}
              onClick={() => handleUse(t.id)}
              className="w-full text-left px-3 py-2 hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors"
            >
              <div className="text-sm font-medium text-surface-700 dark:text-surface-200 truncate">
                {t.title}
              </div>
              <div className="text-xs text-surface-400 truncate mt-0.5">
                {t.content.slice(0, 80)}...
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
