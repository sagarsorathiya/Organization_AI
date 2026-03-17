import { useState } from "react";
import { Share2, Copy, Check, Link2, X, Loader2 } from "lucide-react";
import { post, del, get } from "@/api/client";
import { toast } from "sonner";
import type { SharedConversation } from "@/types";

interface Props {
  conversationId: string;
  onClose: () => void;
}

export function ShareDialog({ conversationId, onClose }: Props) {
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(true);

  // Check existing share status on mount
  useState(() => {
    get<{ shared: boolean; share_token?: string }>(`/share/status/${conversationId}`)
      .then((res) => {
        if (res.shared && res.share_token) setShareToken(res.share_token);
      })
      .finally(() => setChecking(false));
  });

  const handleShare = async () => {
    setLoading(true);
    try {
      const data = await post<SharedConversation>(`/share/${conversationId}`);
      setShareToken(data.share_token);
      toast.success("Share link created");
    } catch {
      toast.error("Failed to create share link");
    } finally {
      setLoading(false);
    }
  };

  const handleUnshare = async () => {
    setLoading(true);
    try {
      await del(`/share/${conversationId}`);
      setShareToken(null);
      toast.success("Share link removed");
    } catch {
      toast.error("Failed to remove share link");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareToken) return;
    const url = `${window.location.origin}/shared/${shareToken}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-surface-800 rounded-xl shadow-2xl w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-surface-700">
          <div className="flex items-center gap-2">
            <Share2 size={18} className="text-primary-600 dark:text-primary-400" />
            <h2 className="font-semibold text-surface-800 dark:text-surface-100">Share Conversation</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-700">
            <X size={16} className="text-surface-400" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {checking ? (
            <div className="flex justify-center py-4">
              <Loader2 size={20} className="animate-spin text-surface-400" />
            </div>
          ) : shareToken ? (
            <>
              <p className="text-sm text-surface-500 dark:text-surface-400">
                Anyone with this link can view this conversation (read-only).
              </p>
              <div className="flex items-center gap-2 bg-surface-50 dark:bg-surface-900 rounded-lg px-3 py-2">
                <Link2 size={14} className="text-surface-400 shrink-0" />
                <span className="text-xs text-surface-600 dark:text-surface-300 truncate flex-1 font-mono">
                  {window.location.origin}/shared/{shareToken}
                </span>
                <button
                  onClick={handleCopy}
                  className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700"
                  aria-label="Copy link"
                >
                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-surface-400" />}
                </button>
              </div>
              <button
                onClick={handleUnshare}
                disabled={loading}
                className="text-xs text-red-500 hover:text-red-600 hover:underline"
              >
                Remove share link
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-surface-500 dark:text-surface-400">
                Create a read-only link to share this conversation.
              </p>
              <button
                onClick={handleShare}
                disabled={loading}
                className="btn-primary text-sm w-full flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
                Create Share Link
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
