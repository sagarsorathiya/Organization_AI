import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";
import { useNavigate } from "react-router-dom";
import { Sun, Moon, Monitor, LogOut, User, Menu } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { KeyboardShortcutsButton } from "@/components/KeyboardShortcutsModal";
import { NotificationBell } from "@/components/Notifications/NotificationBell";

export function Header({
  onMenuClick,
  showMenuButton,
}: {
  onMenuClick?: () => void;
  showMenuButton?: boolean;
}) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const [showProfile, setShowProfile] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const themeIcon =
    theme === "dark" ? <Moon size={18} /> : theme === "light" ? <Sun size={18} /> : <Monitor size={18} />;

  const cycleTheme = () => {
    const order: Array<"light" | "dark" | "system"> = ["light", "dark", "system"];
    const idx = order.indexOf(theme);
    setTheme(order[(idx + 1) % order.length]);
  };

  return (
    <header className="h-14 border-b bg-white dark:bg-surface-900 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        {showMenuButton && (
          <button
            onClick={onMenuClick}
            className="btn-ghost p-2 md:hidden"
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>
        )}
        <h1 className="text-lg font-semibold text-surface-800 dark:text-surface-100">
          Organization AI Assistant
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Keyboard shortcuts */}
        <KeyboardShortcutsButton />

        {/* Notifications */}
        <NotificationBell />

        {/* Theme toggle */}
        <button
          onClick={cycleTheme}
          className="btn-ghost p-2"
          title={`Theme: ${theme}`}
          aria-label={`Switch theme, currently ${theme}`}
        >
          {themeIcon}
        </button>

        {/* Profile dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="flex items-center gap-2 btn-ghost px-2 py-1.5"
            aria-label="Open profile menu"
            aria-expanded={showProfile}
          >
            <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
              <User size={16} className="text-primary-600 dark:text-primary-400" />
            </div>
            <span className="text-sm font-medium max-w-[120px] truncate hidden sm:block">
              {user?.display_name}
            </span>
          </button>

          {showProfile && (
            <div className="absolute right-0 top-full mt-1 w-64 card p-3 z-50 shadow-lg">
              <div className="px-2 pb-2 mb-2 border-b">
                <p className="font-medium text-sm">{user?.display_name}</p>
                <p className="text-xs text-surface-500">{user?.email}</p>
                {user?.department && (
                  <p className="text-xs text-surface-400 mt-0.5">{user.department}</p>
                )}
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-2 py-2 text-sm text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
