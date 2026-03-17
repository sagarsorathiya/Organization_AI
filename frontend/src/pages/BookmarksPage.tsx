import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBookmarkStore } from "@/store/bookmarkStore";
import { useChatStore } from "@/store/chatStore";
import { Bookmark, MessageSquare, Trash2, Loader2 } from "lucide-react";

export function BookmarksPage() {
  const navigate = useNavigate();
  const { bookmarks, isLoading, loadBookmarks, toggleBookmark } = useBookmarkStore();
  const { selectConversation } = useChatStore();

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  const handleGoToConversation = async (conversationId: string) => {
    await selectConversation(conversationId);
    navigate("/");
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Bookmark size={22} className="text-primary-600" />
          <h2 className="text-xl font-semibold text-surface-800 dark:text-surface-100">
            Bookmarks
          </h2>
          <span className="text-sm text-surface-400 ml-auto">{bookmarks.length} saved</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-primary-500" />
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="text-center py-12">
            <Bookmark size={48} className="mx-auto text-surface-300 dark:text-surface-600 mb-3" />
            <p className="text-surface-500">No bookmarks yet.</p>
            <p className="text-xs text-surface-400 mt-1">
              Click the bookmark icon on any message to save it here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {bookmarks.map((bm) => (
              <div
                key={bm.id}
                className="card p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <Bookmark size={16} className="text-primary-500 shrink-0 mt-0.5 fill-primary-500" />
                  <div className="flex-1 min-w-0">
                    {bm.note && (
                      <p className="text-sm font-medium text-surface-700 dark:text-surface-200 mb-1">
                        {bm.note}
                      </p>
                    )}
                    <p className="text-xs text-surface-400">
                      Saved {new Date(bm.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {bm.conversation_id && (
                      <button
                        onClick={() => handleGoToConversation(bm.conversation_id)}
                        className="p-1.5 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-500 hover:text-primary-500"
                        title="Go to conversation"
                      >
                        <MessageSquare size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => toggleBookmark(bm.message_id)}
                      className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
                      title="Remove bookmark"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
