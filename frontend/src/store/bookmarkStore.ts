import { create } from "zustand";
import type { MessageBookmark } from "@/types";
import { get, post, del } from "@/api/client";

interface BookmarkState {
  bookmarks: MessageBookmark[];
  bookmarkedIds: Set<string>;
  isLoading: boolean;
  loadBookmarks: () => Promise<void>;
  toggleBookmark: (messageId: string, note?: string) => Promise<void>;
  isBookmarked: (messageId: string) => boolean;
}

export const useBookmarkStore = create<BookmarkState>((set, getState) => ({
  bookmarks: [],
  bookmarkedIds: new Set<string>(),
  isLoading: false,

  loadBookmarks: async () => {
    set({ isLoading: true });
    try {
      const data = await get<MessageBookmark[]>("/bookmarks");
      const ids = new Set(data.map((b) => b.message_id));
      set({ bookmarks: data, bookmarkedIds: ids, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  toggleBookmark: async (messageId: string, note?: string) => {
    const { bookmarkedIds } = getState();
    if (bookmarkedIds.has(messageId)) {
      await del(`/bookmarks/message/${messageId}`);
      set((s) => {
        const next = new Set(s.bookmarkedIds);
        next.delete(messageId);
        return {
          bookmarks: s.bookmarks.filter((b) => b.message_id !== messageId),
          bookmarkedIds: next,
        };
      });
    } else {
      const data = await post<MessageBookmark>("/bookmarks", { message_id: messageId, note });
      set((s) => {
        const next = new Set(s.bookmarkedIds);
        next.add(messageId);
        return {
          bookmarks: [...s.bookmarks, data],
          bookmarkedIds: next,
        };
      });
    }
  },

  isBookmarked: (messageId: string) => {
    return getState().bookmarkedIds.has(messageId);
  },
}));
