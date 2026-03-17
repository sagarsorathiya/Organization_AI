import { useState, useEffect } from "react";
import { useThemeStore } from "@/store/themeStore";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import { useBookmarkStore } from "@/store/bookmarkStore";
import { get, patch } from "@/api/client";
import type { UserSettings, UserStats } from "@/types";
import { Sun, Moon, Monitor, Save, Loader2, Key, BarChart3, Download, Bookmark, Trash2 } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";

export function SettingsPage() {
  const { setTheme } = useThemeStore();
  const { user, changePassword } = useAuthStore();
  const { availableModels, defaultModel, loadModels } = useChatStore();
  const [settings, setSettings] = useState<UserSettings>({
    theme: "system",
    preferred_model: null,
    data_retention_days: 365,
    system_prompt: null,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Password change state
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  // User stats
  const [stats, setStats] = useState<UserStats | null>(null);
  const { bookmarks, loadBookmarks, toggleBookmark } = useBookmarkStore();
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    get<UserSettings>("/settings").then((data) => {
      setSettings(data);
      setTheme(data.theme);
    });
    loadModels();
    get<UserStats>("/settings/stats").then(setStats).catch(() => {});
    loadBookmarks();
  }, [setTheme, loadModels, loadBookmarks]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await patch("/settings", {
        theme: settings.theme,
        preferred_model: settings.preferred_model,
        data_retention_days: settings.data_retention_days,
        system_prompt: settings.system_prompt,
      });
      setSaved(true);
      toast.success("Settings saved");
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setChangingPw(true);
    try {
      await changePassword(oldPassword, newPassword);
      toast.success("Password changed successfully");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error("Failed to change password. Wrong old password?");
    } finally {
      setChangingPw(false);
    }
  };

  // Backend enforces local-only password changes
  // Show the form to all users; server returns error for domain accounts

  const themeOptions: { value: UserSettings["theme"]; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h2 className="text-xl font-semibold text-surface-800 dark:text-surface-100 mb-6">
          Settings
        </h2>

        <div className="space-y-6">
          {/* Theme */}
          <div className="card p-5">
            <h3 className="font-medium text-surface-700 dark:text-surface-200 mb-3">
              Appearance
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => {
                    setSettings({ ...settings, theme: value });
                    setTheme(value);
                  }}
                  className={clsx(
                    "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all",
                    settings.theme === value
                      ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                      : "border-surface-200 dark:border-surface-700 hover:border-surface-300"
                  )}
                >
                  <Icon size={20} />
                  <span className="text-sm">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Preferred Model (F9) */}
          {availableModels.length > 0 && (
            <div className="card p-5">
              <h3 className="font-medium text-surface-700 dark:text-surface-200 mb-1">
                Preferred Model
              </h3>
              <p className="text-xs text-surface-400 mb-3">
                Choose a default model for your conversations. Leave as default to use the system-wide model.
              </p>
              <select
                value={settings.preferred_model || ""}
                onChange={(e) =>
                  setSettings({ ...settings, preferred_model: e.target.value || null })
                }
                className="input-field max-w-xs"
              >
                <option value="">System default ({defaultModel || "auto"})</option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}

          {/* System Prompt */}
          <div className="card p-5">
            <h3 className="font-medium text-surface-700 dark:text-surface-200 mb-1">
              Custom Instructions
            </h3>
            <p className="text-xs text-surface-400 mb-3">
              Set a system prompt that will be prepended to every conversation.
            </p>
            <textarea
              value={settings.system_prompt || ""}
              onChange={(e) =>
                setSettings({ ...settings, system_prompt: e.target.value || null })
              }
              placeholder="e.g. You are a helpful assistant that specializes in our company's products..."
              rows={4}
              maxLength={4000}
              className="input-field w-full text-sm resize-y"
            />
            <p className="text-xs text-surface-400 mt-1 text-right">
              {(settings.system_prompt || "").length}/4000
            </p>
          </div>

          {/* Data Retention */}
          <div className="card p-5">
            <h3 className="font-medium text-surface-700 dark:text-surface-200 mb-3">
              Data Retention
            </h3>
            <div>
              <label className="text-sm text-surface-600 dark:text-surface-400 mb-1 block">
                Keep conversation history for
              </label>
              <select
                value={settings.data_retention_days}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    data_retention_days: Number(e.target.value),
                  })
                }
                className="input-field max-w-xs"
              >
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>1 year</option>
                <option value={730}>2 years</option>
                <option value={3650}>10 years</option>
              </select>
            </div>
          </div>

          {/* Password Change (local users only) */}
          {(user?.is_local_account ?? false) && <div className="card p-5">
            <h3 className="font-medium text-surface-700 dark:text-surface-200 mb-1 flex items-center gap-2">
              <Key size={16} />
              Change Password
            </h3>
            <p className="text-xs text-surface-400 mb-3">
              Only available for local accounts. Domain users should change passwords via Active Directory.
            </p>
            <div className="space-y-3 max-w-sm">
              <input
                type="password"
                placeholder="Current password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="input-field w-full text-sm"
                autoComplete="current-password"
              />
              <input
                type="password"
                placeholder="New password (min 8 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input-field w-full text-sm"
                autoComplete="new-password"
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field w-full text-sm"
                autoComplete="new-password"
              />
              <button
                onClick={handleChangePassword}
                disabled={changingPw || !oldPassword || !newPassword || !confirmPassword}
                className="btn-primary text-sm flex items-center gap-2"
              >
                {changingPw ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Key size={14} />
                )}
                Change Password
              </button>
            </div>
          </div>}

          {/* User Usage Dashboard */}
          {stats && (
            <div className="card p-5">
              <h3 className="font-medium text-surface-700 dark:text-surface-200 mb-3 flex items-center gap-2">
                <BarChart3 size={16} />
                Usage Dashboard
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-lg bg-surface-50 dark:bg-surface-800 p-3 text-center">
                  <p className="text-lg font-bold text-surface-800 dark:text-surface-100">{stats.total_conversations}</p>
                  <p className="text-[10px] text-surface-400">Conversations</p>
                </div>
                <div className="rounded-lg bg-surface-50 dark:bg-surface-800 p-3 text-center">
                  <p className="text-lg font-bold text-surface-800 dark:text-surface-100">{stats.total_messages}</p>
                  <p className="text-[10px] text-surface-400">Messages</p>
                </div>
                <div className="rounded-lg bg-surface-50 dark:bg-surface-800 p-3 text-center">
                  <p className="text-lg font-bold text-surface-800 dark:text-surface-100">{stats.messages_this_month}</p>
                  <p className="text-[10px] text-surface-400">This Month</p>
                </div>
                <div className="rounded-lg bg-surface-50 dark:bg-surface-800 p-3 text-center">
                  <p className="text-sm font-medium text-surface-800 dark:text-surface-100 truncate">{stats.top_models?.[0]?.model || "—"}</p>
                  <p className="text-[10px] text-surface-400">Top Model</p>
                </div>
                <div className="rounded-lg bg-surface-50 dark:bg-surface-800 p-3 text-center">
                  <p className="text-sm font-medium text-surface-800 dark:text-surface-100">
                    {stats.messages_this_week || 0}
                  </p>
                  <p className="text-[10px] text-surface-400">This Week</p>
                </div>
                <div className="rounded-lg bg-surface-50 dark:bg-surface-800 p-3 text-center">
                  <p className="text-lg font-bold text-surface-800 dark:text-surface-100">{stats.total_uploads}</p>
                  <p className="text-[10px] text-surface-400">Uploads</p>
                </div>
              </div>
            </div>
          )}

          {/* Bulk Export */}
          <div className="card p-5">
            <h3 className="font-medium text-surface-700 dark:text-surface-200 mb-1 flex items-center gap-2">
              <Download size={16} />
              Export All Conversations
            </h3>
            <p className="text-xs text-surface-400 mb-3">
              Download all your conversations as a ZIP file with Markdown files.
            </p>
            <button
              onClick={async () => {
                setExporting(true);
                try {
                  const token = localStorage.getItem("auth_token");
                  const res = await fetch("/api/conversations/export-all", {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                    credentials: "include",
                  });
                  if (!res.ok) throw new Error("Export failed");
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "conversations.zip";
                  a.click();
                  URL.revokeObjectURL(url);
                } catch {
                  // silent
                } finally {
                  setExporting(false);
                }
              }}
              disabled={exporting}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {exporting ? "Exporting..." : "Export as ZIP"}
            </button>
          </div>

          {/* Bookmarks Overview */}
          {bookmarks.length > 0 && (
            <div className="card p-5">
              <h3 className="font-medium text-surface-700 dark:text-surface-200 mb-3 flex items-center gap-2">
                <Bookmark size={16} />
                Bookmarks ({bookmarks.length})
              </h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {bookmarks.slice(0, 10).map((bm) => (
                  <div key={bm.id} className="flex items-center gap-2 text-xs">
                    <Bookmark size={12} className="text-primary-500 shrink-0 fill-primary-500" />
                    <span className="text-surface-500 truncate flex-1">{bm.note || "Bookmarked message"}</span>
                    <button
                      onClick={() => toggleBookmark(bm.message_id)}
                      className="text-red-400 hover:text-red-500 shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save Settings */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : saved ? (
              "Saved!"
            ) : (
              <>
                <Save size={16} />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
