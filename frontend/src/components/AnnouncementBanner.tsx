import { useEffect } from "react";
import { useAnnouncementStore } from "@/store/announcementStore";
import { X, Info, AlertTriangle, Wrench } from "lucide-react";
import clsx from "clsx";

const typeConfig = {
  info: { icon: Info, bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800", text: "text-blue-700 dark:text-blue-300" },
  warning: { icon: AlertTriangle, bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-800", text: "text-amber-700 dark:text-amber-300" },
  maintenance: { icon: Wrench, bg: "bg-purple-50 dark:bg-purple-900/20", border: "border-purple-200 dark:border-purple-800", text: "text-purple-700 dark:text-purple-300" },
};

export function AnnouncementBanner() {
  const { loadAnnouncements, visibleAnnouncements, dismiss } = useAnnouncementStore();

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  const visible = visibleAnnouncements();
  if (visible.length === 0) return null;

  return (
    <div className="space-y-1">
      {visible.map((a) => {
        const cfg = typeConfig[a.type] || typeConfig.info;
        const Icon = cfg.icon;
        return (
          <div
            key={a.id}
            className={clsx("flex items-start gap-2 px-4 py-2 border-b text-sm", cfg.bg, cfg.border)}
          >
            <Icon size={16} className={clsx("shrink-0 mt-0.5", cfg.text)} />
            <div className="flex-1 min-w-0">
              <span className={clsx("font-medium", cfg.text)}>{a.title}</span>
              {a.content && <span className={clsx("ml-1", cfg.text)}> — {a.content}</span>}
            </div>
            <button
              onClick={() => dismiss(a.id)}
              className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
              aria-label="Dismiss"
            >
              <X size={14} className={cfg.text} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
