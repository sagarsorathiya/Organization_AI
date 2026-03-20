import { useState, useRef, useEffect } from "react";
import { useNotificationStore } from "@/store/notificationStore";
import { Bell, CheckCheck, Info, AlertTriangle, Zap, AlertCircle } from "lucide-react";
import clsx from "clsx";

export function NotificationBell() {
  const { notifications, unreadCount, loadNotifications, markRead, markAllRead } =
    useNotificationStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadNotifications();
    // Poll every 60 seconds
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const typeIcon = (type: string) => {
    switch (type) {
      case "warning":
        return <AlertTriangle size={14} className="text-amber-500" />;
      case "alert":
        return <AlertCircle size={14} className="text-red-500" />;
      case "task_result":
        return <Zap size={14} className="text-blue-500" />;
      default:
        return <Info size={14} className="text-surface-500" />;
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="btn-ghost p-2 relative"
        title="Notifications"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 card p-0 z-50 shadow-lg max-h-96 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-3 border-b">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                <CheckCheck size={12} />
                Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <p className="text-sm text-surface-500 text-center py-8">
                No notifications yet
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.is_read) markRead(n.id);
                  }}
                  className={clsx(
                    "w-full flex items-start gap-2 p-3 text-left border-b last:border-b-0 transition-colors",
                    n.is_read
                      ? "bg-transparent"
                      : "bg-primary-50/50 dark:bg-primary-900/10"
                  )}
                >
                  <div className="mt-0.5">{typeIcon(n.type)}</div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={clsx(
                        "text-sm",
                        !n.is_read && "font-medium"
                      )}
                    >
                      {n.title}
                    </p>
                    {n.content && (
                      <p className="text-xs text-surface-500 mt-0.5 line-clamp-2">
                        {n.content}
                      </p>
                    )}
                    <p className="text-xs text-surface-400 mt-1">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                  {!n.is_read && (
                    <div className="w-2 h-2 rounded-full bg-primary-500 mt-1.5 flex-shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
