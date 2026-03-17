import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useChatStore } from "@/store/chatStore";
import {
  MessageSquarePlus,
  Trash2,
  Pencil,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Settings,
  Shield,
  Pin,
  Archive,
  ArchiveRestore,
  Search,
  Bot,
  Plus,
  Bookmark,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { get, post, del } from "@/api/client";
import type { ConversationTag } from "@/types";
import clsx from "clsx";

function formatRelativeTime(dateStr: string) {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const {
    conversations,
    activeConversationId,
    selectConversation,
    renameConversation,
    deleteConversation,
    pinConversation,
    archiveConversation,
    clearChat,
    sidebarSearch,
    setSidebarSearch,
  } = useChatStore();

  const [collapsed, setCollapsed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [expandedActions, setExpandedActions] = useState<string | null>(null);
  const [localSearch, setLocalSearch] = useState(sidebarSearch);

  // Tags
  const [tags, setTags] = useState<ConversationTag[]>([]);
  const [activeTagId, setActiveTagId] = useState<string | null>(null);

  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  useEffect(() => {
    get<ConversationTag[]>("/tags").then(setTags).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTagId) {
      // Fetch conversations for this tag (tag link API returns tag links for a conversation)
      // We need to filter client-side since we don't have a "conversations by tag" endpoint
      // Instead, iterate conversations — just filter using local state
    }
  }, [activeTagId]);

  const createTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const tag = await post<ConversationTag>("/tags", { name: newTagName.trim() });
      setTags((t) => [...t, tag]);
      setNewTagName("");
      setShowNewTag(false);
    } catch { /* silent */ }
  };

  const deleteTag = async (tagId: string) => {
    try {
      await del(`/tags/${tagId}`);
      setTags((t) => t.filter((tg) => tg.id !== tagId));
      if (activeTagId === tagId) setActiveTagId(null);
    } catch { /* silent */ }
  };
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // P11: Debounce sidebar search
  const handleSearchChange = useCallback((value: string) => {
    setLocalSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSidebarSearch(value), 250);
  }, [setSidebarSearch]);

  // Filtered + grouped conversations
  const { pinned, unpinned } = useMemo(() => {
    let list = conversations;

    // Filter by archive status
    if (!showArchived) {
      list = list.filter((c) => !c.archived_at);
    } else {
      list = list.filter((c) => !!c.archived_at);
    }

    // Search filter
    if (sidebarSearch.trim()) {
      const q = sidebarSearch.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.last_message_preview?.toLowerCase().includes(q))
      );
    }

    const pinned = list.filter((c) => c.is_pinned);
    const unpinned = list.filter((c) => !c.is_pinned);
    return { pinned, unpinned };
  }, [conversations, sidebarSearch, showArchived]);

  const handleNewChat = async () => {
    clearChat();
    navigate("/");
  };

  const handleSelect = async (id: string) => {
    await selectConversation(id);
    navigate("/");
  };

  const handleStartRename = (id: string, title: string) => {
    setEditingId(id);
    setEditTitle(title);
    setExpandedActions(null);
  };

  const handleConfirmRename = async () => {
    if (editingId && editTitle.trim()) {
      await renameConversation(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteConversation(id);
    setConfirmDeleteId(null);
  };

  const toggleActions = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedActions(expandedActions === id ? null : id);
  };

  if (collapsed) {
    return (
      <nav
        aria-label="Sidebar collapsed"
        className="w-14 h-full border-r bg-surface-50 dark:bg-surface-900 flex flex-col items-center"
      >
        {/* Top: AI logo + expand + new chat */}
        <div className="flex flex-col items-center gap-1 py-3 border-b w-full px-1.5">
          <button
            onClick={handleNewChat}
            className="p-2 relative group rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors"
            aria-label="Dashboard"
          >
            <Bot size={20} />
            <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-surface-800 dark:bg-surface-700 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
              Dashboard
            </span>
          </button>
          <button
            onClick={() => setCollapsed(false)}
            className="btn-ghost p-2 relative group"
            aria-label="Expand sidebar"
          >
            <ChevronRight size={20} />
            <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-surface-800 dark:bg-surface-700 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
              Expand sidebar
            </span>
          </button>
          <button
            onClick={handleNewChat}
            className="btn-ghost p-2 relative group"
            aria-label="New chat"
          >
            <MessageSquarePlus size={20} />
            <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-surface-800 dark:bg-surface-700 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
              New chat
            </span>
          </button>
        </div>

        {/* Conversation icons */}
        <div className="flex-1 overflow-y-auto py-2 flex flex-col items-center gap-1 w-full px-1.5">
          {conversations
            .filter((c) => !c.archived_at)
            .slice(0, 20)
            .map((conv) => {
              const isActive = conv.id === activeConversationId;
              const initial = conv.title.charAt(0).toUpperCase();
              return (
                <button
                  key={conv.id}
                  onClick={() => handleSelect(conv.id)}
                  className={clsx(
                    "w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0 transition-colors relative group",
                    isActive
                      ? "bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 ring-1 ring-primary-300 dark:ring-primary-700"
                      : "text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-700 dark:hover:text-surface-300"
                  )}
                  aria-label={conv.title}
                >
                  {conv.is_pinned ? (
                    <Pin size={14} className={isActive ? "fill-primary-500 text-primary-500" : ""} />
                  ) : (
                    initial
                  )}
                  <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-surface-800 dark:bg-surface-700 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 max-w-48 truncate">
                    {conv.title}
                  </span>
                </button>
              );
            })}
        </div>

        {/* Footer icons */}
        <div className="border-t w-full flex flex-col items-center gap-1 py-2 px-1.5">
          <button
            onClick={() => navigate("/settings")}
            className={clsx(
              "p-2 rounded-lg transition-colors relative group",
              location.pathname === "/settings"
                ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300"
                : "text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800"
            )}
            aria-label="Settings"
          >
            <Settings size={18} />
            <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-surface-800 dark:bg-surface-700 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
              Settings
            </span>
          </button>
          {user?.is_admin && (
            <button
              onClick={() => navigate("/admin")}
              className={clsx(
                "p-2 rounded-lg transition-colors relative group",
                location.pathname === "/admin"
                  ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300"
                  : "text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800"
              )}
              aria-label="Admin Panel"
            >
              <Shield size={18} />
              <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-surface-800 dark:bg-surface-700 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                Admin Panel
              </span>
            </button>
          )}
        </div>
      </nav>
    );
  }

  const renderConversation = (conv: typeof conversations[0]) => {
    const isActive = conv.id === activeConversationId;
    const showActions = expandedActions === conv.id;

    return (
      <div
        key={conv.id}
        role="listitem"
        className={clsx(
          "group flex flex-col px-3 py-2 rounded-lg cursor-pointer transition-colors relative",
          isActive
            ? "bg-primary-100 dark:bg-primary-900/40 ring-1 ring-primary-300 dark:ring-primary-700 text-primary-700 dark:text-primary-300"
            : "hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-700 dark:text-surface-300"
        )}
        onClick={() => handleSelect(conv.id)}
      >
        {editingId === conv.id ? (
          <div className="flex items-center gap-1 min-w-0">
            <input
              className="input-field text-sm py-1 flex-1"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirmRename();
                if (e.key === "Escape") setEditingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleConfirmRename();
              }}
              className="p-1 text-green-600"
              aria-label="Confirm rename"
            >
              <Check size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingId(null);
              }}
              className="p-1 text-red-500"
              aria-label="Cancel rename"
            >
              <X size={14} />
            </button>
          </div>
        ) : confirmDeleteId === conv.id ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-red-600 dark:text-red-400 truncate flex-1">
              Delete this conversation?
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(conv.id);
              }}
              className="text-xs px-2 py-0.5 rounded bg-red-500 text-white hover:bg-red-600"
              aria-label="Confirm delete"
            >
              Yes
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDeleteId(null);
              }}
              className="text-xs px-2 py-0.5 rounded border border-surface-300 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800"
              aria-label="Cancel delete"
            >
              No
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 min-w-0">
              {conv.is_pinned && (
                <Pin size={12} className="shrink-0 text-primary-500 fill-primary-500" aria-hidden />
              )}
              <span className="flex-1 truncate text-sm font-medium">{conv.title}</span>

              {/* Relative time */}
              <span className="text-[10px] text-surface-400 shrink-0 hidden group-hover:hidden sm:inline">
                {formatRelativeTime(conv.updated_at)}
              </span>

              {/* Actions - visible on hover (desktop) or tap (mobile) */}
              <button
                onClick={(e) => toggleActions(conv.id, e)}
                className={clsx(
                  "p-0.5 rounded text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 shrink-0 md:hidden",
                  showActions && "text-surface-600 dark:text-surface-300"
                )}
                aria-label="More actions"
              >
                <Pencil size={12} />
              </button>

              <div className={clsx(
                "gap-0.5 shrink-0",
                showActions ? "flex" : "hidden group-hover:flex"
              )}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    pinConversation(conv.id, !conv.is_pinned);
                    setExpandedActions(null);
                  }}
                  className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700"
                  aria-label={conv.is_pinned ? "Unpin" : "Pin"}
                >
                  <Pin size={12} className={conv.is_pinned ? "text-primary-500 fill-primary-500" : ""} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    archiveConversation(conv.id);
                    setExpandedActions(null);
                  }}
                  className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700"
                  aria-label={conv.archived_at ? "Unarchive" : "Archive"}
                >
                  {conv.archived_at ? <ArchiveRestore size={12} /> : <Archive size={12} />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartRename(conv.id, conv.title);
                  }}
                  className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700"
                  aria-label="Rename conversation"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteId(conv.id);
                    setExpandedActions(null);
                  }}
                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                  aria-label="Delete conversation"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            {conv.last_message_preview && (
              <p className="text-xs text-surface-400 dark:text-surface-500 truncate mt-0.5">
                {conv.last_message_preview}
              </p>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <nav aria-label="Sidebar" className="w-72 h-full border-r bg-surface-50 dark:bg-surface-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b">
        <button
          onClick={handleNewChat}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors"
          aria-label="Dashboard"
        >
          <Bot size={18} />
          <span className="font-semibold text-sm">AI Assistant</span>
        </button>
        <div className="flex gap-1">
          <button onClick={handleNewChat} className="btn-ghost p-1.5" aria-label="New chat">
            <MessageSquarePlus size={18} />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="btn-ghost p-1.5 hidden md:block"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft size={18} />
          </button>
        </div>
      </div>

      {/* Search + Archive toggle */}
      <div className="px-2 pt-2 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="input-field text-sm py-1.5 pl-8 pr-2 w-full"
            aria-label="Search conversations"
          />
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setShowArchived(false)}
            className={clsx(
              "flex-1 text-xs py-1 rounded-md transition-colors",
              !showArchived
                ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium"
                : "text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800"
            )}
          >
            Active
          </button>
          <button
            onClick={() => setShowArchived(true)}
            className={clsx(
              "flex-1 text-xs py-1 rounded-md transition-colors flex items-center justify-center gap-1",
              showArchived
                ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium"
                : "text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800"
            )}
          >
            <Archive size={11} />
            Archived
          </button>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            <button
              onClick={() => setActiveTagId(null)}
              className={clsx(
                "text-[10px] px-1.5 py-0.5 rounded-full transition-colors",
                !activeTagId
                  ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                  : "bg-surface-100 dark:bg-surface-800 text-surface-500 hover:text-surface-700"
              )}
            >
              All
            </button>
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => setActiveTagId(activeTagId === tag.id ? null : tag.id)}
                className={clsx(
                  "text-[10px] px-1.5 py-0.5 rounded-full transition-colors flex items-center gap-0.5",
                  activeTagId === tag.id
                    ? "text-white"
                    : "bg-surface-100 dark:bg-surface-800 text-surface-500 hover:text-surface-700"
                )}
                style={activeTagId === tag.id ? { backgroundColor: tag.color } : undefined}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                {tag.name}
                {activeTagId === tag.id && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteTag(tag.id); }}
                    className="ml-0.5 hover:text-red-300"
                    title="Delete tag"
                  >
                    <X size={8} />
                  </button>
                )}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1 mt-1">
          {showNewTag ? (
            <div className="flex items-center gap-1 flex-1">
              <input
                className="input-field text-xs py-0.5 px-1.5 flex-1"
                placeholder="Tag name"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createTag(); if (e.key === "Escape") setShowNewTag(false); }}
                autoFocus
              />
              <button onClick={createTag} className="p-0.5 text-green-500"><Check size={12} /></button>
              <button onClick={() => setShowNewTag(false)} className="p-0.5 text-red-500"><X size={12} /></button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewTag(true)}
              className="text-[10px] text-surface-400 hover:text-surface-600 flex items-center gap-0.5"
            >
              <Plus size={10} />
              Tag
            </button>
          )}
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5" role="list">
        {/* Pinned section */}
        {pinned.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 px-2 pt-1 pb-1">
              <Pin size={10} className="text-surface-400 fill-surface-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-400">
                Pinned
              </span>
            </div>
            {pinned.map(renderConversation)}
            {unpinned.length > 0 && (
              <div className="border-b border-surface-200 dark:border-surface-700 my-1.5 mx-2" />
            )}
          </>
        )}

        {/* Recent section */}
        {unpinned.length > 0 && pinned.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 pt-1 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-400">
              Recent
            </span>
          </div>
        )}
        {unpinned.map(renderConversation)}

        {pinned.length === 0 && unpinned.length === 0 && (
          <p className="text-center text-sm text-surface-400 py-8">
            {sidebarSearch
              ? "No matching conversations"
              : showArchived
              ? "No archived conversations"
              : "No conversations yet"}
          </p>
        )}
      </div>

      {/* Footer Nav */}
      <div className="border-t px-2 py-2 space-y-0.5">
        <button
          onClick={() => navigate("/settings")}
          className={clsx(
            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
            location.pathname === "/settings"
              ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium"
              : "text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800"
          )}
          aria-label="Settings"
        >
          <Settings size={16} />
          Settings
        </button>
        <button
          onClick={() => navigate("/bookmarks")}
          className={clsx(
            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
            location.pathname === "/bookmarks"
              ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium"
              : "text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800"
          )}
          aria-label="Bookmarks"
        >
          <Bookmark size={16} />
          Bookmarks
        </button>
        {user?.is_admin && (
          <button
            onClick={() => navigate("/admin")}
            className={clsx(
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
              location.pathname === "/admin"
                ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium"
                : "text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800"
            )}
            aria-label="Admin Panel"
          >
            <Shield size={16} />
            Admin Panel
          </button>
        )}
      </div>
    </nav>
  );
}
