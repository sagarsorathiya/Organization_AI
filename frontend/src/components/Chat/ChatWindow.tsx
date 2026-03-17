import { useEffect, useRef, useMemo } from "react";
import { useChatStore } from "@/store/chatStore";
import { useFeedbackStore } from "@/store/feedbackStore";
import { useBookmarkStore } from "@/store/bookmarkStore";
import { useCallback, useState } from "react";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { StreamingMessage } from "./StreamingMessage";
import { ShareDialog } from "@/components/ShareDialog";
import { KeyboardShortcutsButton } from "@/components/KeyboardShortcutsModal";
import { toast } from "sonner";
import {
  Bot,
  Download,
  Shield,
  Code,
  FileText,
  MessageSquare,
  BookOpen,
  Calculator,
  Languages,
  Search,
  PenTool,
  Lock,
  Zap,
  Share2,
} from "lucide-react";
import type { Message } from "@/types";

function MessageSkeleton() {
  return (
    <div className="flex gap-3 py-4 animate-pulse">
      <div className="w-8 h-8 rounded-full bg-surface-200 dark:bg-surface-700 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-surface-200 dark:bg-surface-700 rounded w-3/4" />
        <div className="h-4 bg-surface-200 dark:bg-surface-700 rounded w-1/2" />
      </div>
    </div>
  );
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function groupByDate(messages: Message[]): { label: string; msgs: Message[] }[] {
  const groups: { label: string; msgs: Message[] }[] = [];
  let currentLabel = "";
  for (const msg of messages) {
    const label = formatDateLabel(msg.created_at);
    if (label !== currentLabel) {
      groups.push({ label, msgs: [] });
      currentLabel = label;
    }
    groups[groups.length - 1].msgs.push(msg);
  }
  return groups;
}

export function ChatWindow() {
  const {
    messages,
    isLoadingMessages,
    isStreaming,
    streamingContent,
    activeConversationId,
    error,
    setError,
    editAndResend,
    sendMessageStream,
    selectedModel,
  } = useChatStore();
  const { loadConversationFeedback } = useFeedbackStore();
  const { loadBookmarks } = useBookmarkStore();
  const [showShare, setShowShare] = useState(false);

  // Load feedback + bookmarks when conversation changes
  useEffect(() => {
    if (activeConversationId) {
      loadConversationFeedback(activeConversationId);
    }
  }, [activeConversationId, loadConversationFeedback]);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  const handleEditMessage = useCallback(
    (messageId: string, newContent: string) => {
      editAndResend(messageId, newContent);
    },
    [editAndResend]
  );

  const handleRegenerate = useCallback(
    (messageId: string) => {
      // Find the last user message before this assistant message
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx <= 0) return;
      const userMsg = messages[idx - 1];
      if (userMsg?.role !== "user") return;
      // Re-send the user's message
      sendMessageStream(userMsg.content, selectedModel || undefined);
    },
    [messages, sendMessageStream, selectedModel]
  );

  // Find last assistant message id
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const dateGroups = useMemo(() => groupByDate(messages), [messages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const handleExport = async (fmt: "markdown" | "json") => {
    if (!activeConversationId) return;
    try {
      const res = await fetch(
        `/api/conversations/${activeConversationId}/export?fmt=${fmt}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
          credentials: "include",
        }
      );
      if (!res.ok) return;
      const text = await res.text();
      const blob = new Blob([text], {
        type: fmt === "json" ? "application/json" : "text/markdown",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chat-export.${fmt === "json" ? "json" : "md"}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to export conversation");
    }
  };

  // Empty state — capabilities dashboard
  if (!activeConversationId && messages.length === 0) {
    const capabilities = [
      { icon: MessageSquare, title: "Smart Conversations", desc: "Natural chat with context-aware responses and conversation history" },
      { icon: Code, title: "Code Assistance", desc: "Write, debug, explain, and review code across multiple languages" },
      { icon: FileText, title: "Document Analysis", desc: "Summarize, extract insights, and answer questions about text content" },
      { icon: PenTool, title: "Content Writing", desc: "Draft emails, reports, proposals, and creative content" },
      { icon: Calculator, title: "Math & Reasoning", desc: "Solve calculations, logic problems, and data analysis tasks" },
      { icon: Languages, title: "Multilingual", desc: "Communicate in 29+ languages with translation support" },
      { icon: BookOpen, title: "Knowledge Base", desc: "Answer general questions with broad knowledge across domains" },
      { icon: Search, title: "Research & Summary", desc: "Compile information, compare options, and create structured summaries" },
    ];

    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-8">
            {/* Hero */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mb-4 mx-auto">
                <Bot size={32} className="text-primary-600 dark:text-primary-400" />
              </div>
              <h2 className="text-2xl font-semibold text-surface-800 dark:text-surface-100 mb-2">
                How can I help you today?
              </h2>
              <p className="text-surface-500 dark:text-surface-400 max-w-md mx-auto">
                Your private AI assistant — powered by on-premises AI. All data stays within your organization's network.
              </p>
            </div>

            {/* Capabilities grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              {capabilities.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="flex gap-3 p-3.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-850 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-surface-800 dark:text-surface-100">{title}</h3>
                    <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Security badge */}
            <div className="flex items-center justify-center gap-4 text-xs text-surface-400 dark:text-surface-500">
              <span className="flex items-center gap-1.5">
                <Lock size={12} />
                End-to-end private
              </span>
              <span className="w-1 h-1 rounded-full bg-surface-300 dark:bg-surface-600" />
              <span className="flex items-center gap-1.5">
                <Shield size={12} />
                On-premises AI
              </span>
              <span className="w-1 h-1 rounded-full bg-surface-300 dark:bg-surface-600" />
              <span className="flex items-center gap-1.5">
                <Zap size={12} />
                Real-time streaming
              </span>
            </div>
          </div>
        </div>
        <ChatInput />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Error banner */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-2 text-sm text-red-600 dark:text-red-400 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-medium hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Export & Share buttons */}
      {activeConversationId && messages.length > 0 && (
        <div className="flex justify-end px-4 pt-2 gap-1">
          <KeyboardShortcutsButton />
          <button
            onClick={() => setShowShare(true)}
            className="flex items-center gap-1 text-xs text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 px-2 py-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800"
            aria-label="Share conversation"
          >
            <Share2 size={12} /> Share
          </button>
          <button
            onClick={() => handleExport("markdown")}
            className="flex items-center gap-1 text-xs text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 px-2 py-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800"
            aria-label="Export as Markdown"
          >
            <Download size={12} /> .md
          </button>
          <button
            onClick={() => handleExport("json")}
            className="flex items-center gap-1 text-xs text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 px-2 py-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800"
            aria-label="Export as JSON"
          >
            <Download size={12} /> .json
          </button>
        </div>
      )}

      {/* Share dialog */}
      {showShare && activeConversationId && (
        <ShareDialog conversationId={activeConversationId} onClose={() => setShowShare(false)} />
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-1">
          {isLoadingMessages ? (
            <>
              <MessageSkeleton />
              <MessageSkeleton />
              <MessageSkeleton />
            </>
          ) : (
            <>
              {dateGroups.map((group) => (
                <div key={group.label}>
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-surface-200 dark:bg-surface-700" />
                    <span className="text-[10px] text-surface-400 font-medium uppercase tracking-wider">
                      {group.label}
                    </span>
                    <div className="flex-1 h-px bg-surface-200 dark:bg-surface-700" />
                  </div>
                  {group.msgs.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      onEdit={handleEditMessage}
                      onRegenerate={handleRegenerate}
                      isLastAssistant={msg.id === lastAssistantId}
                    />
                  ))}
                </div>
              ))}
              {isStreaming && <StreamingMessage content={streamingContent} />}
            </>
          )}
        </div>
      </div>

      {/* Input */}
      <ChatInput />
    </div>
  );
}
