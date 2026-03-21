import type { Message } from "@/types";
import { Bot, Copy, Check, Pencil, Send, ThumbsUp, ThumbsDown, Bookmark, RefreshCw } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import clsx from "clsx";
import { useAuthStore } from "@/store/authStore";
import { useFeedbackStore } from "@/store/feedbackStore";
import { useBookmarkStore } from "@/store/bookmarkStore";

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

interface Props {
  message: Message;
  onEdit?: (messageId: string, newContent: string) => void;
  onRegenerate?: (messageId: string) => void;
  isLastAssistant?: boolean;
}

export function MessageBubble({ message, onEdit, onRegenerate, isLastAssistant }: Props) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuthStore();
  const { feedbackMap, submitFeedback } = useFeedbackStore();
  const { bookmarkedIds, toggleBookmark } = useBookmarkStore();
  const feedback = feedbackMap[message.id];
  const isBookmarked = bookmarkedIds.has(message.id);

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.style.height = "auto";
      editRef.current.style.height = `${editRef.current.scrollHeight}px`;
    }
  }, [isEditing]);

  const handleEditSubmit = () => {
    const trimmed = editContent.trim();
    if (!trimmed || !onEdit) return;
    onEdit(message.id, trimmed);
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const initials = user ? getInitials(user.display_name) : "U";

  return (
    <div
      className={clsx(
        "group flex gap-3 py-4 animate-fadeIn",
        isUser ? "flex-row-reverse" : ""
      )}
      role="article"
      aria-label={isUser ? "Your message" : "Assistant message"}
    >
      {/* Avatar */}
      <div
        className={clsx(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 text-xs font-bold select-none",
          isUser
            ? "bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300"
            : "bg-emerald-100 dark:bg-emerald-900/40"
        )}
        aria-hidden="true"
      >
        {isUser ? (
          initials
        ) : (
          <Bot size={16} className="text-emerald-600 dark:text-emerald-400" />
        )}
      </div>

      {/* Content */}
      <div
        className={clsx(
          "flex-1 min-w-0",
          isUser ? "text-right" : ""
        )}
      >
        <div
          className={clsx(
            "inline-block text-left rounded-2xl px-4 py-3 max-w-full",
            isUser
              ? "bg-primary-600 text-white rounded-tr-md"
              : "bg-surface-100 dark:bg-surface-800 text-surface-800 dark:text-surface-200 rounded-tl-md"
          )}
        >
          {isUser ? (
            isEditing ? (
              <div className="min-w-[200px]">
                <textarea
                  ref={editRef}
                  value={editContent}
                  onChange={(e) => {
                    setEditContent(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleEditSubmit();
                    }
                    if (e.key === "Escape") handleEditCancel();
                  }}
                  className="w-full bg-primary-700/50 text-white rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-white/30"
                  rows={1}
                />
                <div className="flex justify-end gap-1.5 mt-2">
                  <button
                    onClick={handleEditCancel}
                    className="px-2.5 py-1 text-xs rounded-md bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEditSubmit}
                    disabled={!editContent.trim()}
                    className="px-2.5 py-1 text-xs rounded-md bg-white/20 hover:bg-white/30 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    <Send size={10} /> Send
                  </button>
                </div>
              </div>
            ) : (
              message.content.includes("![") && message.content.includes("data:image/") ? (
                <div className="whitespace-pre-wrap break-words">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      img({ src, alt }) {
                        return <img src={src} alt={alt || "attached image"} className="max-w-xs max-h-64 rounded-lg mt-1 mb-1 border border-white/20" />;
                      },
                      p({ children }) {
                        return <p className="whitespace-pre-wrap break-words mb-1">{children}</p>;
                      },
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              )
            )
          ) : (
            <div className="markdown-content prose-sm max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const codeString = String(children).replace(/\n$/, "");

                    if (match) {
                      return (
                        <SyntaxHighlighter
                          style={oneDark}
                          language={match[1]}
                          PreTag="div"
                          className="rounded-lg !my-2"
                        >
                          {codeString}
                        </SyntaxHighlighter>
                      );
                    }
                    return (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Timestamp and actions */}
        <div className={clsx("flex items-center gap-2 mt-1", isUser ? "justify-end" : "")}>
          <span className="text-[10px] text-surface-400">{formatTime(message.created_at)}</span>
          {isUser && onEdit && !isEditing && (
            <button
              onClick={() => { setEditContent(message.content); setIsEditing(true); }}
              className="p-1 rounded text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Edit message"
            >
              <Pencil size={12} />
            </button>
          )}
          {!isUser && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleCopy}
                className="p-1 rounded text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"
                aria-label="Copy message"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
              <button
                onClick={() => submitFeedback(message.id, true)}
                className={clsx("p-1 rounded", feedback?.is_positive === true ? "text-green-500" : "text-surface-400 hover:text-green-500")}
                aria-label="Thumbs up"
              >
                <ThumbsUp size={14} />
              </button>
              <button
                onClick={() => submitFeedback(message.id, false)}
                className={clsx("p-1 rounded", feedback?.is_positive === false ? "text-red-500" : "text-surface-400 hover:text-red-500")}
                aria-label="Thumbs down"
              >
                <ThumbsDown size={14} />
              </button>
              <button
                onClick={() => toggleBookmark(message.id)}
                className={clsx("p-1 rounded", isBookmarked ? "text-amber-500" : "text-surface-400 hover:text-amber-500")}
                aria-label={isBookmarked ? "Remove bookmark" : "Bookmark"}
              >
                <Bookmark size={14} className={isBookmarked ? "fill-amber-500" : ""} />
              </button>
              {isLastAssistant && onRegenerate && (
                <button
                  onClick={() => onRegenerate(message.id)}
                  className="p-1 rounded text-surface-400 hover:text-primary-500"
                  aria-label="Regenerate response"
                >
                  <RefreshCw size={14} />
                </button>
              )}
              {message.model && (
                <span className="text-[10px] text-surface-400 self-center ml-1">
                  {message.model}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
