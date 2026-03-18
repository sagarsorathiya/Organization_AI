import { useState, useEffect, useCallback, useRef } from "react";
import { get, patch, post, del } from "@/api/client";
import type {
  SystemHealth,
  UsageMetrics,
  AuditLogEntry,
  ModelInfo,
  AdminUser,
  AdminSettings,
  DatabaseInfo,
  PullProgress,
  Announcement,
  PromptTemplate,
} from "@/types";
import {
  Activity,
  Users,
  MessageSquare,
  Database,
  Bot,
  Clock,
  Shield,
  RefreshCw,
  Save,
  Check,
  UserPlus,
  Loader2,
  Plug,
  X,
  HardDrive,
  Download,
  Upload,
  Trash2,
  AlertTriangle,
  Pencil,
  Square,
  PackagePlus,
  Paperclip,
  Megaphone,
  FileText,
  ThumbsUp,
  ThumbsDown,
  Plus,
  ToggleLeft,
  ToggleRight,
  Key,
} from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";

type Tab = "overview" | "settings" | "users" | "audit" | "models" | "database" | "announcements" | "templates" | "feedback";

const POPULAR_MODELS = [
  { name: "llama3.3:70b",         family: "Llama",     params: "70B",   size: "43 GB",   desc: "Meta's most capable open model" },
  { name: "llama3.1:8b",          family: "Llama",     params: "8B",    size: "4.7 GB",  desc: "Great balance of speed and quality" },
  { name: "llama3.1:70b",         family: "Llama",     params: "70B",   size: "40 GB",   desc: "High quality, needs 48GB+ RAM" },
  { name: "llama3.2:1b",          family: "Llama",     params: "1B",    size: "1.3 GB",  desc: "Ultra-light, fast inference" },
  { name: "llama3.2:3b",          family: "Llama",     params: "3B",    size: "2.0 GB",  desc: "Lightweight general-purpose" },
  { name: "gemma3:4b",            family: "Gemma",     params: "4B",    size: "3.3 GB",  desc: "Google's efficient small model" },
  { name: "gemma3:12b",           family: "Gemma",     params: "12B",   size: "8.1 GB",  desc: "Strong mid-range model by Google" },
  { name: "gemma3:27b",           family: "Gemma",     params: "27B",   size: "17 GB",   desc: "Google's top open model" },
  { name: "qwen3:8b",             family: "Qwen",      params: "8B",    size: "4.9 GB",  desc: "Alibaba's versatile model" },
  { name: "qwen3:14b",            family: "Qwen",      params: "14B",   size: "9.0 GB",  desc: "Strong reasoning and coding" },
  { name: "qwen3:32b",            family: "Qwen",      params: "32B",   size: "20 GB",   desc: "Top-tier Qwen model" },
  { name: "qwen2.5-coder:7b",     family: "Qwen",      params: "7B",    size: "4.7 GB",  desc: "Optimized for code generation" },
  { name: "qwen2.5-coder:14b",    family: "Qwen",      params: "14B",   size: "9.0 GB",  desc: "Advanced code assistant" },
  { name: "qwen2.5-coder:32b",    family: "Qwen",      params: "32B",   size: "20 GB",   desc: "Best-in-class code model" },
  { name: "deepseek-r1:8b",       family: "DeepSeek",  params: "8B",    size: "4.9 GB",  desc: "Reasoning-focused model" },
  { name: "deepseek-r1:14b",      family: "DeepSeek",  params: "14B",   size: "9.0 GB",  desc: "Strong chain-of-thought reasoning" },
  { name: "deepseek-r1:32b",      family: "DeepSeek",  params: "32B",   size: "20 GB",   desc: "Advanced reasoning model" },
  { name: "deepseek-r1:70b",      family: "DeepSeek",  params: "70B",   size: "43 GB",   desc: "Top DeepSeek reasoning model" },
  { name: "mistral:7b",           family: "Mistral",   params: "7B",    size: "4.1 GB",  desc: "Fast and efficient all-rounder" },
  { name: "mistral-small:24b",    family: "Mistral",   params: "24B",   size: "14 GB",   desc: "High quality, multilingual" },
  { name: "phi4:14b",             family: "Phi",       params: "14B",   size: "9.1 GB",  desc: "Microsoft's compact powerhouse" },
  { name: "phi4-mini:3.8b",       family: "Phi",       params: "3.8B",  size: "2.5 GB",  desc: "Tiny but capable model" },
  { name: "codellama:7b",         family: "Llama",     params: "7B",    size: "3.8 GB",  desc: "Meta's code specialist" },
  { name: "codellama:13b",        family: "Llama",     params: "13B",   size: "7.4 GB",  desc: "Better code generation" },
  { name: "codellama:34b",        family: "Llama",     params: "34B",   size: "19 GB",   desc: "Best CodeLlama variant" },
  { name: "nomic-embed-text",     family: "Nomic",     params: "137M",  size: "274 MB",  desc: "Text embedding model" },
  { name: "mxbai-embed-large",    family: "Mixedbread", params: "335M", size: "670 MB",  desc: "Large embedding model" },
];

const POPULAR_MODEL_NAMES = POPULAR_MODELS.map((m) => m.name);

export function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
  const [editSettings, setEditSettings] = useState<Partial<AdminSettings>>({});
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  // Create user form
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    display_name: "",
    email: "",
    department: "",
    is_admin: false,
  });
  const [creatingUser, setCreatingUser] = useState(false);

  // Edit user
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserData, setEditUserData] = useState({ display_name: "", email: "", department: "" });
  const [savingUser, setSavingUser] = useState(false);

  // Database
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbExporting, setDbExporting] = useState(false);
  const [dbImporting, setDbImporting] = useState(false);
  const [clearingTable, setClearingTable] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Model management
  const [pullModelName, setPullModelName] = useState("");
  const [pullingModel, setPullingModel] = useState(false);
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  const [pullAbort, setPullAbort] = useState<AbortController | null>(null);
  const [deletingModel, setDeletingModel] = useState<string | null>(null);
  const [confirmDeleteModel, setConfirmDeleteModel] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);

  // LDAP test connection
  const [ldapTesting, setLdapTesting] = useState(false);
  const [ldapTestResult, setLdapTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Bind password — managed separately (never returned by backend)
  const [bpValue, setBpValue] = useState("");
  const [bpEdited, setBpEdited] = useState(false);
  const bindPasswordDisplay = bpEdited ? bpValue : "";

  // Announcements management
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annLoading, setAnnLoading] = useState(false);
  const [newAnn, setNewAnn] = useState({ title: "", content: "", type: "info" as string, expires_at: "" });
  const [creatingAnn, setCreatingAnn] = useState(false);

  // Templates management
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [newTpl, setNewTpl] = useState({ title: "", content: "", category: "general" });
  const [creatingTpl, setCreatingTpl] = useState(false);

  // Feedback stats
  const [feedbackStats, setFeedbackStats] = useState<{ total: number; positive: number; negative: number; recent: { message_id: string; is_positive: boolean; comment: string | null; created_at: string }[] } | null>(null);
  const [fbLoading, setFbLoading] = useState(false);

  const createUser = async () => {
    if (!newUser.username || !newUser.password || !newUser.display_name) {
      toast.error("Username, password, and display name are required");
      return;
    }
    if (newUser.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setCreatingUser(true);
    try {
      await post("/admin/users", {
        username: newUser.username,
        password: newUser.password,
        display_name: newUser.display_name,
        email: newUser.email || undefined,
        department: newUser.department || undefined,
        is_admin: newUser.is_admin,
      });
      toast.success(`User "${newUser.username}" created`);
      setNewUser({ username: "", password: "", display_name: "", email: "", department: "", is_admin: false });
      setShowCreateUser(false);
      fetchUsers();
    } catch {
      toast.error("Failed to create user. Username may already exist.");
    } finally {
      setCreatingUser(false);
    }
  };

  const testLdapConnection = async () => {
    setLdapTesting(true);
    setLdapTestResult(null);
    try {
      const result = await post<{ success: boolean; message: string }>("/admin/test-ldap", {});
      setLdapTestResult(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Test connection failed";
      setLdapTestResult({ success: false, message: msg });
    } finally {
      setLdapTesting(false);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [h, m] = await Promise.all([
        get<SystemHealth>("/admin/health"),
        get<UsageMetrics>("/admin/metrics"),
      ]);
      setHealth(h);
      setMetrics(m);
    } catch {
      toast.error("Failed to load dashboard data");
    }
    setIsLoading(false);
  };

  const fetchAnnouncements = async () => {
    setAnnLoading(true);
    try {
      const data = await get<{ announcements: Announcement[] } | Announcement[]>("/announcements/all");
      setAnnouncements(Array.isArray(data) ? data : data.announcements ?? []);
    } catch {
      toast.error("Failed to load announcements");
    } finally {
      setAnnLoading(false);
    }
  };

  const createAnnouncement = async () => {
    if (!newAnn.title || !newAnn.content) { toast.error("Title and content required"); return; }
    setCreatingAnn(true);
    try {
      await post("/announcements", {
        title: newAnn.title,
        content: newAnn.content,
        type: newAnn.type,
        expires_at: newAnn.expires_at || null,
      });
      toast.success("Announcement created");
      setNewAnn({ title: "", content: "", type: "info", expires_at: "" });
      fetchAnnouncements();
    } catch { toast.error("Failed to create announcement"); }
    finally { setCreatingAnn(false); }
  };

  const toggleAnnouncement = async (id: string) => {
    try {
      await patch(`/announcements/${id}/toggle`, {});
      fetchAnnouncements();
    } catch { toast.error("Failed to toggle announcement"); }
  };

  const deleteAnnouncement = async (id: string) => {
    try {
      await del(`/announcements/${id}`);
      toast.success("Announcement deleted");
      fetchAnnouncements();
    } catch { toast.error("Failed to delete announcement"); }
  };

  const fetchTemplates = async () => {
    setTplLoading(true);
    try {
      const data = await get<{ templates: PromptTemplate[] } | PromptTemplate[]>("/templates");
      setTemplates(Array.isArray(data) ? data : data.templates ?? []);
    } catch {
      toast.error("Failed to load templates");
    } finally {
      setTplLoading(false);
    }
  };

  const createTemplate = async () => {
    if (!newTpl.title || !newTpl.content) { toast.error("Title and content required"); return; }
    setCreatingTpl(true);
    try {
      await post("/templates", newTpl);
      toast.success("Template created");
      setNewTpl({ title: "", content: "", category: "general" });
      fetchTemplates();
    } catch { toast.error("Failed to create template"); }
    finally { setCreatingTpl(false); }
  };

  const deleteTemplate = async (id: string) => {
    try {
      await del(`/templates/${id}`);
      toast.success("Template deleted");
      fetchTemplates();
    } catch { toast.error("Failed to delete template"); }
  };

  const fetchFeedbackStats = async () => {
    setFbLoading(true);
    try {
      const data = await get<{ total: number; positive: number; negative: number; recent: { message_id: string; is_positive: boolean; comment: string | null; created_at: string }[] }>("/feedback/stats");
      setFeedbackStats(data);
    } catch {
      toast.error("Failed to load feedback stats");
    } finally {
      setFbLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const data = await get<{ logs: AuditLogEntry[]; total: number }>(
        "/admin/audit-logs?limit=100"
      );
      setLogs(data.logs);
      setLogsTotal(data.total);
    } catch {
      toast.error("Failed to load audit logs");
    }
  };

  const fetchModels = async () => {
    try {
      const data = await get<{ models: ModelInfo[]; default_model: string }>(
        "/admin/models"
      );
      setModels(data.models);
      setDefaultModel(data.default_model);
    } catch {
      toast.error("Failed to load models");
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(i > 1 ? 1 : 0)} ${sizes[i]}`;
  };

  const handlePullModel = async (nameOverride?: string) => {
    const name = nameOverride || pullModelName.trim();
    if (!name) return;

    setPullingModel(true);
    setPullProgress({ status: "Starting pull..." });
    const controller = new AbortController();
    setPullAbort(controller);

    try {
      const token = localStorage.getItem("auth_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch("/api/admin/models/pull", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ name }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: "Pull failed" }));
        throw new Error(err.detail || "Pull failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const progress = JSON.parse(line) as PullProgress;
              if (progress.error) {
                setPullProgress({ status: "Error", error: progress.error });
                toast.error(`Pull failed: ${progress.error}`);
                setPullingModel(false);
                setPullAbort(null);
                return;
              }
              setPullProgress(progress);
            } catch {
              // skip malformed line
            }
          }
        }
      }

      setPullProgress({ status: "Pull complete!" });
      toast.success(`Model "${name}" pulled successfully`);
      setPullModelName("");
      fetchModels();
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setPullProgress({ status: "Pull cancelled" });
        toast.info("Pull cancelled");
      } else {
        const msg = err instanceof Error ? err.message : "Pull failed";
        setPullProgress({ status: "Error", error: msg });
        toast.error(msg);
      }
    } finally {
      setPullingModel(false);
      setPullAbort(null);
    }
  };

  const handleCancelPull = () => {
    pullAbort?.abort();
  };

  const handleDeleteModel = async (name: string) => {
    setDeletingModel(name);
    try {
      await del(`/admin/models/${encodeURIComponent(name)}`);
      toast.success(`Model "${name}" deleted`);
      setConfirmDeleteModel(null);
      fetchModels();
    } catch {
      toast.error(`Failed to delete model "${name}"`);
    } finally {
      setDeletingModel(null);
    }
  };

  const handleSetDefault = async (name: string) => {
    setSettingDefault(name);
    try {
      await post<{ success: boolean; default_model: string }>("/admin/models/set-default", { name });
      setDefaultModel(name);
      toast.success(`Default model set to "${name}"`);
    } catch {
      toast.error("Failed to set default model");
    } finally {
      setSettingDefault(null);
    }
  };

  const fetchDbInfo = async () => {
    setDbLoading(true);
    try {
      const data = await get<DatabaseInfo>("/admin/database/info");
      setDbInfo(data);
    } catch {
      toast.error("Failed to load database info");
    } finally {
      setDbLoading(false);
    }
  };

  const handleExport = async () => {
    setDbExporting(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/admin/database/export", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const rawName = match ? match[1] : "org_ai_backup.json";
      // Sanitize: strip path separators and allow only safe characters
      const filename = rawName.replace(/[/\\:*?"<>|]/g, "_").replace(/\.{2,}/g, ".");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Database exported successfully");
    } catch {
      toast.error("Failed to export database");
    } finally {
      setDbExporting(false);
    }
  };

  const handleImport = async (file: File) => {
    setDbImporting(true);
    try {
      const token = localStorage.getItem("auth_token");
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/database/import", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: "Import failed" }));
        throw new Error(body.detail || "Import failed");
      }
      const result = await res.json();
      toast.success(result.message || "Import completed");
      fetchDbInfo();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setDbImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  const handleClearTable = async (tableName: string) => {
    setClearingTable(tableName);
    try {
      const result = await del<{ message: string }>(`/admin/database/clear/${tableName}`);
      toast.success(result.message);
      setConfirmClear(null);
      fetchDbInfo();
    } catch {
      toast.error(`Failed to clear ${tableName}`);
    } finally {
      setClearingTable(null);
    }
  };

  const handleClearAll = async () => {
    setClearingTable("all");
    try {
      const result = await del<{ message: string }>("/admin/database/clear-all");
      toast.success(result.message);
      setConfirmClearAll(false);
      fetchDbInfo();
    } catch {
      toast.error("Failed to clear all data");
    } finally {
      setClearingTable(null);
    }
  };

  const fetchSettings = useCallback(async () => {
    try {
      const data = await get<AdminSettings>("/admin/settings");
      setAdminSettings(data);
      setEditSettings(data);
      setBpEdited(false);
      setBpValue("");
    } catch {
      toast.error("Failed to load settings");
    }
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await get<{ users: AdminUser[]; total: number }>(
        "/admin/users?limit=200"
      );
      setUsers(data.users);
      setUsersTotal(data.total);
    } catch {
      toast.error("Failed to load users");
    }
  };

  const saveSettings = async () => {
    if (!adminSettings) return;
    setSettingsSaving(true);
    setSettingsSaved(false);
    setSettingsError("");
    try {
      // Only send changed fields
      const changed: Record<string, unknown> = {};
      for (const key of Object.keys(editSettings) as (keyof AdminSettings)[]) {
        if (key === "app_env") continue; // Not editable
        if (editSettings[key] !== adminSettings[key]) {
          changed[key] = editSettings[key];
        }
      }
      // Include bind password if it was edited
      if (bpEdited && bpValue) {
        changed["ad_bind_password"] = bpValue;
      }
      if (Object.keys(changed).length === 0) {
        setSettingsSaving(false);
        return;
      }
      const updated = await patch<AdminSettings>("/admin/settings", changed);
      setAdminSettings(updated);
      setEditSettings(updated);
      setBpEdited(false);
      setBpValue("");
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err: unknown) {
      setSettingsError(err instanceof Error ? err.message : "Failed to save settings");
    }
    setSettingsSaving(false);
  };

  const toggleUserAdmin = async (userId: string, currentValue: boolean) => {
    if (!confirm(`Are you sure you want to ${currentValue ? "revoke admin from" : "grant admin to"} this user?`)) return;
    try {
      await patch(`/admin/users/${userId}`, { is_admin: !currentValue });
      fetchUsers();
    } catch {
      toast.error("Failed to update admin status");
    }
  };

  const toggleUserActive = async (userId: string, currentValue: boolean) => {
    try {
      await patch(`/admin/users/${userId}`, { is_active: !currentValue });
      fetchUsers();
    } catch {
      toast.error("Failed to update user status");
    }
  };

  const resetUserPassword = async (userId: string, username: string) => {
    const newPw = prompt(`Enter new password for ${username} (min 8 chars):`);
    if (!newPw) return;
    if (newPw.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    try {
      await patch(`/admin/users/${userId}`, { password: newPw });
      toast.success(`Password reset for ${username}`);
    } catch {
      toast.error("Failed to reset password (user may not be a local account)");
    }
  };

  const startEditUser = (u: AdminUser) => {
    setEditingUserId(u.id);
    setEditUserData({ display_name: u.display_name, email: u.email || "", department: u.department || "" });
  };

  const cancelEditUser = () => {
    setEditingUserId(null);
  };

  const saveEditUser = async () => {
    if (!editingUserId || !editUserData.display_name.trim()) {
      toast.error("Display name is required");
      return;
    }
    setSavingUser(true);
    try {
      await patch(`/admin/users/${editingUserId}`, {
        display_name: editUserData.display_name.trim(),
        email: editUserData.email.trim() || null,
        department: editUserData.department.trim() || null,
      });
      setEditingUserId(null);
      toast.success("User updated");
      fetchUsers();
    } catch {
      toast.error("Failed to update user");
    }
    setSavingUser(false);
  };

  const updateField = <K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) => {
    setEditSettings((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (tab === "audit") fetchLogs();
    if (tab === "models") fetchModels();
    if (tab === "settings") fetchSettings();
    if (tab === "users") fetchUsers();
    if (tab === "database") fetchDbInfo();
    if (tab === "announcements") fetchAnnouncements();
    if (tab === "templates") fetchTemplates();
    if (tab === "feedback") fetchFeedbackStats();
  }, [tab]);

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "settings", label: "Settings" },
    { id: "users", label: "Users" },
    { id: "database", label: "Database" },
    { id: "audit", label: "Audit Logs" },
    { id: "models", label: "Models" },
    { id: "announcements", label: "Announcements" },
    { id: "templates", label: "Templates" },
    { id: "feedback", label: "Feedback" },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Shield size={24} className="text-primary-600" />
            <h2 className="text-xl font-semibold text-surface-800 dark:text-surface-100">
              Admin Panel
            </h2>
          </div>
          <button onClick={fetchData} className="btn-ghost flex items-center gap-1.5 text-sm">
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                tab === t.id
                  ? "border-primary-500 text-primary-600 dark:text-primary-400"
                  : "border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* Health Status */}
            {health && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatusCard
                  icon={Activity}
                  label="System"
                  value={health.status}
                  status={health.status === "healthy" ? "green" : "yellow"}
                />
                <StatusCard
                  icon={Database}
                  label="Database"
                  value={health.database}
                  status={health.database === "healthy" ? "green" : "red"}
                />
                <StatusCard
                  icon={Bot}
                  label="LLM Service"
                  value={health.llm_service}
                  status={health.llm_service === "healthy" ? "green" : "red"}
                />
              </div>
            )}

            {/* Metrics */}
            {metrics && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard icon={Users} label="Total Users" value={metrics.total_users} />
                <MetricCard icon={Users} label="Active Today" value={metrics.active_users_today} />
                <MetricCard icon={MessageSquare} label="Conversations" value={metrics.total_conversations} />
                <MetricCard icon={MessageSquare} label="Messages Today" value={metrics.messages_today} />
              </div>
            )}

            {health && (
              <div className="card p-4 flex items-center gap-3">
                <Clock size={18} className="text-surface-400" />
                <span className="text-sm text-surface-600 dark:text-surface-400">
                  Uptime: {formatUptime(health.uptime_seconds)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Audit Logs Tab */}
        {tab === "audit" && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b bg-surface-50 dark:bg-surface-850">
              <span className="text-sm text-surface-500">
                {logsTotal} total events
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-surface-50 dark:bg-surface-850">
                    <th className="text-left px-4 py-2 font-medium">Time</th>
                    <th className="text-left px-4 py-2 font-medium">User</th>
                    <th className="text-left px-4 py-2 font-medium">Action</th>
                    <th className="text-left px-4 py-2 font-medium">Resource</th>
                    <th className="text-left px-4 py-2 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                    >
                      <td className="px-4 py-2 text-surface-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">{log.username || "—"}</td>
                      <td className="px-4 py-2">
                        <span
                          className={clsx(
                            "inline-block px-2 py-0.5 rounded text-xs font-medium",
                            log.action.includes("login")
                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                              : log.action.includes("error") || log.action.includes("failed")
                              ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                              : "bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300"
                          )}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-surface-500">
                        {log.resource_type ? `${log.resource_type}` : "—"}
                      </td>
                      <td className="px-4 py-2 text-surface-400 font-mono text-xs">
                        {log.ip_address || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Models Tab */}
        {tab === "models" && (
          <div className="space-y-5">
            {/* Pull new model */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-100 mb-3 flex items-center gap-2">
                <PackagePlus className="w-4 h-4" /> Pull Model from Ollama Registry
              </h3>
              <div className="flex gap-2">
                <select
                  value={POPULAR_MODEL_NAMES.includes(pullModelName) ? pullModelName : "__custom__"}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setPullModelName("");
                    } else {
                      setPullModelName(e.target.value);
                    }
                  }}
                  disabled={pullingModel}
                  className="px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none min-w-[220px]"
                >
                  <option value="__custom__">Custom model name...</option>
                  {POPULAR_MODELS.map((m) => (
                    <option key={m.name} value={m.name}>{m.name} — {m.params}</option>
                  ))}
                </select>
                {!POPULAR_MODEL_NAMES.includes(pullModelName) && (
                  <input
                    type="text"
                    value={pullModelName}
                    onChange={(e) => setPullModelName(e.target.value)}
                    placeholder="Enter model name, e.g. mymodel:7b"
                    className="flex-1 px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    disabled={pullingModel}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && pullModelName.trim() && !pullingModel) handlePullModel();
                    }}
                  />
                )}
                {pullingModel ? (
                  <button
                    onClick={handleCancelPull}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                  >
                    <Square className="w-3.5 h-3.5" /> Stop
                  </button>
                ) : (
                  <button
                    onClick={() => handlePullModel()}
                    disabled={!pullModelName.trim()}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Pull
                  </button>
                )}
              </div>
              {/* Selected model details */}
              {(() => {
                const info = POPULAR_MODELS.find((m) => m.name === pullModelName);
                if (!info) return null;
                return (
                  <div className="mt-3 p-3 rounded-lg bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700">
                    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                      <span className="text-surface-500 dark:text-surface-400">
                        Family: <span className="font-medium text-surface-700 dark:text-surface-200">{info.family}</span>
                      </span>
                      <span className="text-surface-500 dark:text-surface-400">
                        Parameters: <span className="font-medium text-surface-700 dark:text-surface-200">{info.params}</span>
                      </span>
                      <span className="text-surface-500 dark:text-surface-400">
                        Download Size: <span className="font-medium text-surface-700 dark:text-surface-200">{info.size}</span>
                      </span>
                    </div>
                    <p className="text-xs text-surface-400 dark:text-surface-500 mt-1.5">{info.desc}</p>
                  </div>
                );
              })()}
              {/* Pull progress */}
              {pullProgress && (
                <div className="mt-3 space-y-2">
                  {pullProgress.error ? (
                    <p className="text-sm text-red-600 dark:text-red-400">{pullProgress.error}</p>
                  ) : (
                    <>
                      <p className="text-xs text-surface-500 dark:text-surface-400">
                        {pullProgress.status}
                        {pullProgress.total && pullProgress.completed != null
                          ? ` — ${formatBytes(pullProgress.completed)} / ${formatBytes(pullProgress.total)}`
                          : ""}
                      </p>
                      {pullProgress.total && pullProgress.completed != null && (
                        <div className="w-full bg-surface-200 dark:bg-surface-700 rounded-full h-2.5">
                          <div
                            className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, (pullProgress.completed / pullProgress.total) * 100)}%` }}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Default model selector */}
            <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="text-sm text-surface-600 dark:text-surface-400">
                Default Model
              </div>
              <div className="flex items-center gap-2">
                {models.length > 0 ? (
                  <select
                    value={defaultModel}
                    onChange={(e) => handleSetDefault(e.target.value)}
                    disabled={!!settingDefault}
                    className="px-3 py-1.5 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-sm font-medium text-surface-800 dark:text-surface-100 focus:ring-2 focus:ring-primary-500 focus:outline-none disabled:opacity-50"
                  >
                    {models.map((m) => (
                      <option key={m.name} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm text-surface-400 italic">No models installed</span>
                )}
                {settingDefault && <Loader2 className="w-4 h-4 animate-spin text-primary-500" />}
              </div>
            </div>

            {/* Installed models header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300">
                Installed Models ({models.length})
              </h3>
              <button
                onClick={fetchModels}
                className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>

            {/* Model cards */}
            <div className="grid gap-3">
              {models.map((model) => (
                <div key={model.name} className="card p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-surface-800 dark:text-surface-100">
                          {model.name}
                        </p>
                        {model.name === defaultModel && (
                          <span className="text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded-full font-medium">
                            Default
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-surface-500 dark:text-surface-400">
                        {model.size_bytes != null && (
                          <span>Size: {formatBytes(model.size_bytes)}</span>
                        )}
                        {model.family && <span>Family: {model.family}</span>}
                        {model.parameter_size && <span>Params: {model.parameter_size}</span>}
                        {model.quantization_level && <span>Quant: {model.quantization_level}</span>}
                        {model.modified_at && (
                          <span>Modified: {new Date(model.modified_at).toLocaleDateString()}</span>
                        )}
                        {model.digest && <span className="font-mono">Digest: {model.digest}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
                      {/* Re-pull (update) */}
                      <button
                        onClick={() => { setPullModelName(model.name); handlePullModel(model.name); }}
                        disabled={pullingModel}
                        title="Update model (re-pull latest)"
                        className="p-1.5 rounded-lg text-surface-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      {/* Delete */}
                      {confirmDeleteModel === model.name ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDeleteModel(model.name)}
                            disabled={deletingModel === model.name}
                            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded font-medium"
                          >
                            {deletingModel === model.name ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              "Confirm"
                            )}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteModel(null)}
                            className="px-2 py-1 bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300 text-xs rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteModel(model.name)}
                          disabled={deletingModel === model.name}
                          title="Delete model"
                          className="p-1.5 rounded-lg text-surface-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {models.length === 0 && (
                <div className="text-center py-12">
                  <Bot className="w-10 h-10 text-surface-300 dark:text-surface-600 mx-auto mb-3" />
                  <p className="text-surface-400 dark:text-surface-500">
                    No models found. Pull a model above to get started.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {tab === "settings" && (
          <div className="space-y-6">
            {editSettings && adminSettings ? (
              <>
                {/* Save bar */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-surface-500">
                    Edit settings below and click Save. Changes apply immediately and persist to .env.
                  </p>
                  <div className="flex items-center gap-3">
                    {settingsError && (
                      <span className="text-sm text-red-600 dark:text-red-400">{settingsError}</span>
                    )}
                    {settingsSaved && (
                      <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                        <Check size={14} /> Saved
                      </span>
                    )}
                    <button
                      onClick={saveSettings}
                      disabled={settingsSaving}
                      className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50"
                    >
                      <Save size={14} />
                      {settingsSaving ? "Saving..." : "Save Settings"}
                    </button>
                  </div>
                </div>

                {/* Application Settings */}
                <SettingsSection title="Application" icon={Activity}>
                  <EditableField
                    label="Application Name"
                    value={editSettings.app_name ?? ""}
                    onChange={(v) => updateField("app_name", v)}
                  />
                  <SettingsRow label="Environment" value={adminSettings.app_env} />
                  <EditableSelect
                    label="Log Level"
                    value={editSettings.log_level ?? "INFO"}
                    options={["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]}
                    onChange={(v) => updateField("log_level", v)}
                  />
                </SettingsSection>

                {/* AD / LDAP Settings */}
                <SettingsSection title="Active Directory / LDAP" icon={Shield}>
                  <EditableToggle
                    label="AD Enabled"
                    value={editSettings.ad_enabled ?? false}
                    onChange={(v) => updateField("ad_enabled", v)}
                  />
                  <EditableField
                    label="AD Server"
                    value={editSettings.ad_server ?? ""}
                    onChange={(v) => updateField("ad_server", v)}
                    placeholder="ldap://your-dc.domain.local"
                  />
                  <EditableNumber
                    label="AD Port"
                    value={editSettings.ad_port ?? 389}
                    onChange={(v) => updateField("ad_port", v)}
                  />
                  <EditableToggle
                    label="Use SSL"
                    value={editSettings.ad_use_ssl ?? false}
                    onChange={(v) => updateField("ad_use_ssl", v)}
                  />
                  <EditableField
                    label="Domain"
                    value={editSettings.ad_domain ?? ""}
                    onChange={(v) => updateField("ad_domain", v)}
                    placeholder="MYDOMAIN"
                  />
                  <EditableField
                    label="Base DN"
                    value={editSettings.ad_base_dn ?? ""}
                    onChange={(v) => updateField("ad_base_dn", v)}
                    placeholder="DC=domain,DC=local"
                  />
                  <EditableField
                    label="User Search Base"
                    value={editSettings.ad_user_search_base ?? ""}
                    onChange={(v) => updateField("ad_user_search_base", v)}
                    placeholder="OU=Users,DC=domain,DC=local"
                  />
                  <EditableField
                    label="Group Search Base"
                    value={editSettings.ad_group_search_base ?? ""}
                    onChange={(v) => updateField("ad_group_search_base", v)}
                    placeholder="OU=Groups,DC=domain,DC=local"
                  />
                  <EditableField
                    label="Bind User (Service Account)"
                    value={editSettings.ad_bind_user ?? ""}
                    onChange={(v) => updateField("ad_bind_user", v)}
                    placeholder="svc_ldap_reader (optional)"
                  />
                  <EditableField
                    label="Bind Password"
                    value={bindPasswordDisplay}
                    onChange={(v) => {
                      setBpEdited(true);
                      setBpValue(v);
                    }}
                    placeholder="Service account password (optional)"
                  />
                  <EditableField
                    label="Admin Group"
                    value={editSettings.ad_admin_group ?? ""}
                    onChange={(v) => updateField("ad_admin_group", v)}
                    placeholder="CN=AI-Admins,OU=Groups,DC=domain,DC=local"
                  />
                  {/* Test Connection Button */}
                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-surface-500">Test Connection</span>
                    <div className="flex items-center gap-3">
                      {ldapTestResult && (
                        <span className={clsx(
                          "flex items-center gap-1 text-sm",
                          ldapTestResult.success
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        )}>
                          {ldapTestResult.success ? <Check size={14} /> : <X size={14} />}
                          {ldapTestResult.message}
                        </span>
                      )}
                      <button
                        onClick={testLdapConnection}
                        disabled={ldapTesting || !(editSettings.ad_enabled ?? false)}
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {ldapTesting ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
                        {ldapTesting ? "Testing..." : "Test Connection"}
                      </button>
                    </div>
                  </div>
                </SettingsSection>

                {/* LLM Settings */}
                <SettingsSection title="LLM Engine" icon={Bot}>
                  <EditableSelect
                    label="Provider"
                    value={editSettings.llm_provider ?? "ollama"}
                    options={["ollama", "openai", "azure", "custom"]}
                    onChange={(v) => updateField("llm_provider", v)}
                  />
                  <EditableField
                    label="Base URL"
                    value={editSettings.llm_base_url ?? ""}
                    onChange={(v) => updateField("llm_base_url", v)}
                  />
                  <EditableField
                    label="Default Model"
                    value={editSettings.llm_default_model ?? ""}
                    onChange={(v) => updateField("llm_default_model", v)}
                  />
                  <EditableNumber
                    label="Timeout (s)"
                    value={editSettings.llm_timeout ?? 120}
                    onChange={(v) => updateField("llm_timeout", v)}
                    min={10}
                    max={600}
                  />
                  <EditableNumber
                    label="Max Tokens"
                    value={editSettings.llm_max_tokens ?? 4096}
                    onChange={(v) => updateField("llm_max_tokens", v)}
                    min={256}
                    max={128000}
                  />
                  <EditableNumber
                    label="Temperature"
                    value={editSettings.llm_temperature ?? 0.7}
                    onChange={(v) => updateField("llm_temperature", v)}
                    min={0}
                    max={2}
                    step={0.1}
                  />
                </SettingsSection>

                {/* Chat Context */}
                <SettingsSection title="Chat Context" icon={MessageSquare}>
                  <EditableNumber
                    label="Max Context Messages"
                    value={editSettings.chat_max_context_messages ?? 20}
                    onChange={(v) => updateField("chat_max_context_messages", v)}
                    min={1}
                    max={100}
                  />
                  <EditableNumber
                    label="Max Context Characters"
                    value={editSettings.chat_max_context_chars ?? 16000}
                    onChange={(v) => updateField("chat_max_context_chars", v)}
                    min={1000}
                    max={200000}
                    step={1000}
                  />
                  <div className="px-4 py-2">
                    <p className="text-xs text-surface-400">
                      Controls how many previous messages and characters are sent as context to the LLM.
                      Lower values improve response speed; higher values give the AI more conversation history.
                    </p>
                  </div>
                </SettingsSection>

                {/* Session / Security */}
                <SettingsSection title="Session & Security" icon={Clock}>
                  <EditableNumber
                    label="Session Expire (min)"
                    value={editSettings.session_expire_minutes ?? 480}
                    onChange={(v) => updateField("session_expire_minutes", v)}
                    min={5}
                    max={10080}
                  />
                  <EditableToggle
                    label="Cookie Secure"
                    value={editSettings.session_cookie_secure ?? false}
                    onChange={(v) => updateField("session_cookie_secure", v)}
                  />
                  <EditableSelect
                    label="Cookie SameSite"
                    value={editSettings.session_cookie_samesite ?? "lax"}
                    options={["strict", "lax", "none"]}
                    onChange={(v) => updateField("session_cookie_samesite", v)}
                  />
                  <EditableNumber
                    label="Rate Limit (requests)"
                    value={editSettings.rate_limit_requests ?? 60}
                    onChange={(v) => updateField("rate_limit_requests", v)}
                    min={1}
                    max={10000}
                  />
                  <EditableNumber
                    label="Rate Limit Window (s)"
                    value={editSettings.rate_limit_window_seconds ?? 60}
                    onChange={(v) => updateField("rate_limit_window_seconds", v)}
                    min={1}
                    max={3600}
                  />
                </SettingsSection>

                {/* File Attachments */}
                <SettingsSection title="File Attachments" icon={Paperclip}>
                  <EditableToggle
                    label="Attachments Enabled"
                    value={editSettings.attachments_enabled ?? true}
                    onChange={(v) => updateField("attachments_enabled", v)}
                  />
                  <EditableNumber
                    label="Max File Size (MB)"
                    value={editSettings.attachments_max_size_mb ?? 10}
                    onChange={(v) => updateField("attachments_max_size_mb", v)}
                    min={1}
                    max={100}
                  />
                  <EditableNumber
                    label="Max Extracted Characters"
                    value={editSettings.attachments_max_extract_chars ?? 50000}
                    onChange={(v) => updateField("attachments_max_extract_chars", v)}
                    min={1000}
                    max={500000}
                    step={1000}
                  />
                  <div className="px-4 py-2">
                    <p className="text-xs text-surface-400">
                      Max file size controls the upload limit per file. Max extracted characters
                      controls how much text is extracted from documents before truncation.
                    </p>
                  </div>
                </SettingsSection>

                {/* Local Admin */}
                <SettingsSection title="Local Admin (Break-Glass)" icon={Shield}>
                  <EditableToggle
                    label="Enabled"
                    value={editSettings.local_admin_enabled ?? true}
                    onChange={(v) => updateField("local_admin_enabled", v)}
                  />
                  <EditableField
                    label="Username"
                    value={editSettings.local_admin_username ?? ""}
                    onChange={(v) => updateField("local_admin_username", v)}
                  />
                </SettingsSection>
              </>
            ) : (
              <p className="text-surface-400 text-center py-8">Loading settings...</p>
            )}
          </div>
        )}

        {/* Users Tab */}
        {tab === "users" && (
          <div className="space-y-4">
            {/* Create User Form */}
            {showCreateUser ? (
              <div className="card p-5 space-y-3">
                <h3 className="font-medium text-surface-700 dark:text-surface-200 flex items-center gap-2">
                  <UserPlus size={16} />
                  Create Local User
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Username *"
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    className="text-sm px-3 py-2 rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100"
                  />
                  <input
                    type="password"
                    placeholder="Password * (min 8 chars)"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="text-sm px-3 py-2 rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100"
                    autoComplete="new-password"
                  />
                  <input
                    type="text"
                    placeholder="Display Name *"
                    value={newUser.display_name}
                    onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })}
                    className="text-sm px-3 py-2 rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100"
                  />
                  <input
                    type="email"
                    placeholder="Email (optional)"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    className="text-sm px-3 py-2 rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100"
                  />
                  <input
                    type="text"
                    placeholder="Department (optional)"
                    value={newUser.department}
                    onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
                    className="text-sm px-3 py-2 rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100"
                  />
                  <label className="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
                    <input
                      type="checkbox"
                      checked={newUser.is_admin}
                      onChange={(e) => setNewUser({ ...newUser, is_admin: e.target.checked })}
                      className="rounded"
                    />
                    Admin privileges
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={createUser}
                    disabled={creatingUser}
                    className="btn-primary flex items-center gap-1.5 text-sm"
                  >
                    {creatingUser ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                    Create User
                  </button>
                  <button
                    onClick={() => setShowCreateUser(false)}
                    className="btn-ghost text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b bg-surface-50 dark:bg-surface-850 flex items-center justify-between">
                <span className="text-sm text-surface-500">
                  {usersTotal} total users
                </span>
                <div className="flex items-center gap-2">
                  {!showCreateUser && (
                    <button
                      onClick={() => setShowCreateUser(true)}
                      className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"
                    >
                      <UserPlus size={12} /> New User
                    </button>
                  )}
                  <button onClick={fetchUsers} className="btn-ghost flex items-center gap-1.5 text-xs">
                    <RefreshCw size={12} /> Refresh
                  </button>
                </div>
              </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-surface-50 dark:bg-surface-850">
                    <th className="text-left px-4 py-2 font-medium">User</th>
                    <th className="text-left px-4 py-2 font-medium">Email</th>
                    <th className="text-left px-4 py-2 font-medium">Department</th>
                    <th className="text-left px-4 py-2 font-medium">Role</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-left px-4 py-2 font-medium">Last Login</th>
                    <th className="text-left px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isEditing = editingUserId === u.id;
                    return (
                    <tr
                      key={u.id}
                      className="border-b hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                    >
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <div className="space-y-1">
                            <input
                              type="text"
                              value={editUserData.display_name}
                              onChange={(e) => setEditUserData({ ...editUserData, display_name: e.target.value })}
                              className="text-sm px-2 py-1 rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100 w-full"
                              placeholder="Display Name"
                            />
                            <p className="text-xs text-surface-400">{u.username}</p>
                          </div>
                        ) : (
                          <div>
                            <p className="font-medium text-surface-800 dark:text-surface-100">
                              {u.display_name}
                            </p>
                            <p className="text-xs text-surface-400">{u.username}</p>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <input
                            type="email"
                            value={editUserData.email}
                            onChange={(e) => setEditUserData({ ...editUserData, email: e.target.value })}
                            className="text-sm px-2 py-1 rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100 w-full"
                            placeholder="Email"
                          />
                        ) : (
                          <span className="text-surface-600 dark:text-surface-400">{u.email || "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editUserData.department}
                            onChange={(e) => setEditUserData({ ...editUserData, department: e.target.value })}
                            className="text-sm px-2 py-1 rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100 w-full"
                            placeholder="Department"
                          />
                        ) : (
                          <span className="text-surface-600 dark:text-surface-400">{u.department || "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={clsx(
                            "inline-block px-2 py-0.5 rounded text-xs font-medium",
                            u.is_admin
                              ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                              : "bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300"
                          )}
                        >
                          {u.is_admin ? "Admin" : "User"}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={clsx(
                            "inline-block px-2 py-0.5 rounded text-xs font-medium",
                            u.is_active
                              ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                              : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                          )}
                        >
                          {u.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-surface-500 whitespace-nowrap text-xs">
                        {u.last_login
                          ? new Date(u.last_login).toLocaleString()
                          : "Never"}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2 flex-wrap">
                          {isEditing ? (
                            <>
                              <button
                                onClick={saveEditUser}
                                disabled={savingUser}
                                className="text-xs px-2 py-1 rounded border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors flex items-center gap-1"
                              >
                                {savingUser ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                                Save
                              </button>
                              <button
                                onClick={cancelEditUser}
                                className="text-xs px-2 py-1 rounded border border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors flex items-center gap-1"
                              >
                                <X size={10} /> Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEditUser(u)}
                                className="text-xs px-2 py-1 rounded border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center gap-1"
                              >
                                <Pencil size={10} /> Edit
                              </button>
                              <button
                                onClick={() => toggleUserAdmin(u.id, u.is_admin)}
                                className={clsx(
                                  "text-xs px-2 py-1 rounded border transition-colors",
                                  u.is_admin
                                    ? "border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                    : "border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-800"
                                )}
                              >
                                {u.is_admin ? "Revoke Admin" : "Make Admin"}
                              </button>
                              <button
                                onClick={() => toggleUserActive(u.id, u.is_active)}
                                className={clsx(
                                  "text-xs px-2 py-1 rounded border transition-colors",
                                  u.is_active
                                    ? "border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    : "border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                )}
                              >
                                {u.is_active ? "Deactivate" : "Activate"}
                              </button>
                              {u.is_local_account && (
                              <button
                                onClick={() => resetUserPassword(u.id, u.username)}
                                className="text-xs px-2 py-1 rounded border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors flex items-center gap-1"
                              >
                                <Key size={10} /> Reset Password
                              </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              {users.length === 0 && (
                <p className="text-surface-400 text-center py-8">No users found.</p>
              )}
            </div>
          </div>
          </div>
        )}

        {/* Database Tab */}
        {tab === "database" && (
          <div className="space-y-6">
            {dbLoading && !dbInfo ? (
              <p className="text-surface-400 text-center py-8">Loading database info...</p>
            ) : dbInfo ? (
              <>
                {/* Connection Config */}
                <SettingsSection title="Connection Configuration" icon={HardDrive}>
                  <SettingsRow label="Host" value={dbInfo.host} />
                  <SettingsRow label="Port" value={dbInfo.port} />
                  <SettingsRow label="Database Name" value={dbInfo.name} />
                  <SettingsRow label="User" value={dbInfo.user} />
                  <SettingsRow label="Pool Size" value={dbInfo.pool_size} />
                  <SettingsRow label="Max Overflow" value={dbInfo.max_overflow} />
                  <SettingsRow label="Database Size" value={dbInfo.db_size} />
                  <div className="px-4 py-2.5">
                    <span className="text-sm text-surface-500">PostgreSQL Version</span>
                    <p className="text-xs text-surface-400 mt-0.5 font-mono break-all">{dbInfo.db_version}</p>
                  </div>
                </SettingsSection>

                {/* Table Statistics */}
                <div className="card overflow-hidden">
                  <div className="px-4 py-3 border-b bg-surface-50 dark:bg-surface-850 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database size={16} className="text-surface-400" />
                      <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200">
                        Table Statistics
                      </h3>
                    </div>
                    <span className="text-xs text-surface-400">
                      Total: {dbInfo.total_rows.toLocaleString()} rows
                    </span>
                  </div>
                  <div className="divide-y">
                    {Object.entries(dbInfo.tables).map(([name, count]) => (
                      <div key={name} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm font-mono text-surface-600 dark:text-surface-400">{name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-surface-800 dark:text-surface-100">
                            {count.toLocaleString()} rows
                          </span>
                          {["conversations", "messages", "audit_logs", "file_uploads"].includes(name) && (
                            confirmClear === name ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-red-500">Delete all?</span>
                                <button
                                  onClick={() => handleClearTable(name)}
                                  disabled={clearingTable === name}
                                  className="text-xs px-2 py-0.5 rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                                >
                                  {clearingTable === name ? "Clearing..." : "Yes"}
                                </button>
                                <button
                                  onClick={() => setConfirmClear(null)}
                                  className="text-xs px-2 py-0.5 rounded border border-surface-300 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmClear(name)}
                                className="text-xs px-2 py-1 rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                aria-label={`Clear ${name}`}
                              >
                                <Trash2 size={12} />
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Export / Import / Clear All */}
                <div className="card overflow-hidden">
                  <div className="px-4 py-3 border-b bg-surface-50 dark:bg-surface-850 flex items-center gap-2">
                    <Activity size={16} className="text-surface-400" />
                    <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200">
                      Data Management
                    </h3>
                  </div>
                  <div className="p-4 space-y-4">
                    {/* Export */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-surface-700 dark:text-surface-200">Export Database</p>
                        <p className="text-xs text-surface-400">Download all data as a JSON backup file</p>
                      </div>
                      <button
                        onClick={handleExport}
                        disabled={dbExporting}
                        className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50 transition-colors"
                      >
                        {dbExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        {dbExporting ? "Exporting..." : "Export"}
                      </button>
                    </div>

                    <hr className="border-surface-200 dark:border-surface-700" />

                    {/* Import */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-surface-700 dark:text-surface-200">Import Database</p>
                        <p className="text-xs text-surface-400">Restore from a JSON backup (merges, skips duplicates)</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          ref={importFileRef}
                          type="file"
                          accept=".json"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImport(file);
                          }}
                        />
                        <button
                          onClick={() => importFileRef.current?.click()}
                          disabled={dbImporting}
                          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 disabled:opacity-50 transition-colors"
                        >
                          {dbImporting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                          {dbImporting ? "Importing..." : "Import"}
                        </button>
                      </div>
                    </div>

                    <hr className="border-surface-200 dark:border-surface-700" />

                    {/* Clear All */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-red-600 dark:text-red-400">Clear All Data</p>
                        <p className="text-xs text-surface-400">Permanently delete ALL data from every table. This cannot be undone.</p>
                      </div>
                      {confirmClearAll ? (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                            <AlertTriangle size={14} />
                            <span className="text-xs font-medium">Are you absolutely sure?</span>
                          </div>
                          <button
                            onClick={handleClearAll}
                            disabled={clearingTable === "all"}
                            className="text-xs px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {clearingTable === "all" ? "Clearing..." : "Yes, Delete Everything"}
                          </button>
                          <button
                            onClick={() => setConfirmClearAll(false)}
                            className="text-xs px-3 py-1.5 rounded border border-surface-300 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmClearAll(true)}
                          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 size={14} />
                          Clear All
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* Announcements Tab */}
        {tab === "announcements" && (
          <div className="space-y-6">
            {/* Create Announcement */}
            <div className="card p-5">
              <h3 className="font-medium text-surface-700 dark:text-surface-200 mb-3 flex items-center gap-2">
                <Megaphone size={16} />
                Create Announcement
              </h3>
              <div className="space-y-3 max-w-lg">
                <input
                  className="input-field w-full text-sm"
                  placeholder="Title"
                  value={newAnn.title}
                  onChange={(e) => setNewAnn({ ...newAnn, title: e.target.value })}
                />
                <textarea
                  className="input-field w-full text-sm resize-y"
                  placeholder="Content"
                  rows={3}
                  value={newAnn.content}
                  onChange={(e) => setNewAnn({ ...newAnn, content: e.target.value })}
                />
                <div className="flex gap-3">
                  <select
                    className="input-field text-sm"
                    value={newAnn.type}
                    onChange={(e) => setNewAnn({ ...newAnn, type: e.target.value })}
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                  <input
                    type="datetime-local"
                    className="input-field text-sm"
                    value={newAnn.expires_at}
                    onChange={(e) => setNewAnn({ ...newAnn, expires_at: e.target.value })}
                    title="Expires at (optional)"
                  />
                </div>
                <button
                  onClick={createAnnouncement}
                  disabled={creatingAnn}
                  className="btn-primary text-sm flex items-center gap-2"
                >
                  {creatingAnn ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Create
                </button>
              </div>
            </div>

            {/* List */}
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b bg-surface-50 dark:bg-surface-850 flex items-center justify-between">
                <span className="text-sm font-medium">All Announcements ({announcements.length})</span>
                {annLoading && <Loader2 size={14} className="animate-spin" />}
              </div>
              {announcements.length === 0 ? (
                <p className="text-sm text-surface-400 p-4">No announcements yet.</p>
              ) : (
                <div className="divide-y">
                  {announcements.map((a) => (
                    <div key={a.id} className="px-4 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={clsx(
                            "text-xs px-1.5 py-0.5 rounded font-medium",
                            a.type === "warning" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700" :
                            a.type === "maintenance" ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700" :
                            "bg-blue-100 dark:bg-blue-900/30 text-blue-700"
                          )}>{a.type}</span>
                          <span className="text-sm font-medium">{a.title}</span>
                          {!a.is_active && <span className="text-xs text-surface-400">(inactive)</span>}
                        </div>
                        <p className="text-xs text-surface-500 truncate">{a.content}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => toggleAnnouncement(a.id)}
                          className="p-1.5 rounded hover:bg-surface-100 dark:hover:bg-surface-800"
                          title={a.is_active ? "Deactivate" : "Activate"}
                        >
                          {a.is_active ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} className="text-surface-400" />}
                        </button>
                        <button
                          onClick={() => deleteAnnouncement(a.id)}
                          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Templates Tab */}
        {tab === "templates" && (
          <div className="space-y-6">
            {/* Create Template */}
            <div className="card p-5">
              <h3 className="font-medium text-surface-700 dark:text-surface-200 mb-3 flex items-center gap-2">
                <FileText size={16} />
                Create Prompt Template
              </h3>
              <div className="space-y-3 max-w-lg">
                <input
                  className="input-field w-full text-sm"
                  placeholder="Title"
                  value={newTpl.title}
                  onChange={(e) => setNewTpl({ ...newTpl, title: e.target.value })}
                />
                <textarea
                  className="input-field w-full text-sm resize-y"
                  placeholder="Template content (use {topic} for placeholders)"
                  rows={4}
                  value={newTpl.content}
                  onChange={(e) => setNewTpl({ ...newTpl, content: e.target.value })}
                />
                <input
                  className="input-field w-full text-sm"
                  placeholder="Category (e.g. general, coding, writing)"
                  value={newTpl.category}
                  onChange={(e) => setNewTpl({ ...newTpl, category: e.target.value })}
                />
                <button
                  onClick={createTemplate}
                  disabled={creatingTpl}
                  className="btn-primary text-sm flex items-center gap-2"
                >
                  {creatingTpl ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Create Template
                </button>
              </div>
            </div>

            {/* List */}
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b bg-surface-50 dark:bg-surface-850 flex items-center justify-between">
                <span className="text-sm font-medium">All Templates ({templates.length})</span>
                {tplLoading && <Loader2 size={14} className="animate-spin" />}
              </div>
              {templates.length === 0 ? (
                <p className="text-sm text-surface-400 p-4">No templates yet.</p>
              ) : (
                <div className="divide-y">
                  {templates.map((t) => (
                    <div key={t.id} className="px-4 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 font-medium">
                            {t.category}
                          </span>
                          <span className="text-sm font-medium">{t.title}</span>
                          {t.is_system && <span className="text-xs text-primary-500">(system)</span>}
                        </div>
                        <p className="text-xs text-surface-500 truncate">{t.content}</p>
                        <span className="text-[10px] text-surface-400">Used {t.usage_count} times</span>
                      </div>
                      <button
                        onClick={() => deleteTemplate(t.id)}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 shrink-0"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Feedback Tab */}
        {tab === "feedback" && (
          <div className="space-y-6">
            {fbLoading ? (
              <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-primary-500" /></div>
            ) : feedbackStats ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="card p-4 text-center">
                    <p className="text-2xl font-bold text-surface-800 dark:text-surface-100">{feedbackStats.total}</p>
                    <p className="text-xs text-surface-400 mt-1">Total Feedback</p>
                  </div>
                  <div className="card p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <ThumbsUp size={18} className="text-green-500" />
                      <p className="text-2xl font-bold text-green-600">{feedbackStats.positive}</p>
                    </div>
                    <p className="text-xs text-surface-400 mt-1">Positive</p>
                  </div>
                  <div className="card p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <ThumbsDown size={18} className="text-red-500" />
                      <p className="text-2xl font-bold text-red-600">{feedbackStats.negative}</p>
                    </div>
                    <p className="text-xs text-surface-400 mt-1">Negative</p>
                  </div>
                </div>

                {feedbackStats.total > 0 && (
                  <div className="card p-4">
                    <p className="text-sm font-medium mb-2">
                      Satisfaction Rate: {Math.round((feedbackStats.positive / feedbackStats.total) * 100)}%
                    </p>
                    <div className="w-full bg-surface-200 dark:bg-surface-700 rounded-full h-3">
                      <div
                        className="bg-green-500 h-3 rounded-full transition-all"
                        style={{ width: `${(feedbackStats.positive / feedbackStats.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {feedbackStats.recent && feedbackStats.recent.length > 0 && (
                  <div className="card overflow-hidden">
                    <div className="px-4 py-3 border-b bg-surface-50 dark:bg-surface-850">
                      <span className="text-sm font-medium">Recent Feedback</span>
                    </div>
                    <div className="divide-y">
                      {feedbackStats.recent.map((fb, i) => (
                        <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                          {fb.is_positive ? (
                            <ThumbsUp size={14} className="text-green-500 shrink-0" />
                          ) : (
                            <ThumbsDown size={14} className="text-red-500 shrink-0" />
                          )}
                          <span className="text-xs text-surface-500 truncate flex-1">
                            {fb.comment || "No comment"}
                          </span>
                          <span className="text-[10px] text-surface-400 shrink-0">
                            {new Date(fb.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-surface-400 text-center py-8">No feedback data available.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  status,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  status: "green" | "yellow" | "red";
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div
        className={clsx(
          "w-10 h-10 rounded-lg flex items-center justify-center",
          status === "green" && "bg-emerald-100 dark:bg-emerald-900/30",
          status === "yellow" && "bg-amber-100 dark:bg-amber-900/30",
          status === "red" && "bg-red-100 dark:bg-red-900/30"
        )}
      >
        <Icon
          size={20}
          className={clsx(
            status === "green" && "text-emerald-600 dark:text-emerald-400",
            status === "yellow" && "text-amber-600 dark:text-amber-400",
            status === "red" && "text-red-600 dark:text-red-400"
          )}
        />
      </div>
      <div>
        <p className="text-sm text-surface-500">{label}</p>
        <p className="font-semibold capitalize text-surface-800 dark:text-surface-100">
          {value}
        </p>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className="text-surface-400" />
        <span className="text-xs text-surface-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-surface-800 dark:text-surface-100">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function SettingsSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Activity;
  children: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b bg-surface-50 dark:bg-surface-850 flex items-center gap-2">
        <Icon size={16} className="text-surface-400" />
        <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200">
          {title}
        </h3>
      </div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

function SettingsRow({
  label,
  value,
}: {
  label: string;
  value: string | number | boolean;
}) {
  const display =
    typeof value === "boolean" ? (
      <span
        className={clsx(
          "inline-block px-2 py-0.5 rounded text-xs font-medium",
          value
            ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
            : "bg-surface-100 dark:bg-surface-700 text-surface-500 dark:text-surface-400"
        )}
      >
        {value ? "Enabled" : "Disabled"}
      </span>
    ) : (
      <span className="text-sm text-surface-800 dark:text-surface-100 font-mono">
        {String(value)}
      </span>
    );

  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-surface-500">{label}</span>
      {display}
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-surface-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-sm font-mono px-2 py-1 rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100 w-64 placeholder:text-surface-300 dark:placeholder:text-surface-600"
      />
    </div>
  );
}

function EditableNumber({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-surface-500">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="text-sm font-mono px-2 py-1 rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100 w-32"
      />
    </div>
  );
}

function EditableSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-surface-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm px-2 py-1 rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function EditableToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-surface-500">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={clsx(
          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
          value ? "bg-primary-500" : "bg-surface-300 dark:bg-surface-600"
        )}
      >
        <span
          className={clsx(
            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
            value ? "translate-x-6" : "translate-x-1"
          )}
        />
      </button>
    </div>
  );
}
