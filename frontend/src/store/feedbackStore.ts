import { create } from "zustand";
import type { MessageFeedback } from "@/types";
import { get, post, del } from "@/api/client";

interface FeedbackState {
  /** Map of message_id → feedback */
  feedbackMap: Record<string, MessageFeedback>;
  loadConversationFeedback: (conversationId: string) => Promise<void>;
  submitFeedback: (messageId: string, isPositive: boolean, comment?: string) => Promise<void>;
  removeFeedback: (messageId: string) => Promise<void>;
  getFeedback: (messageId: string) => MessageFeedback | undefined;
}

export const useFeedbackStore = create<FeedbackState>((set, getState) => ({
  feedbackMap: {},

  loadConversationFeedback: async (conversationId: string) => {
    try {
      const data = await get<Record<string, MessageFeedback>>(
        `/feedback/conversation/${conversationId}`
      );
      set((s) => ({ feedbackMap: { ...s.feedbackMap, ...data } }));
    } catch {
      // silent
    }
  },

  submitFeedback: async (messageId: string, isPositive: boolean, comment?: string) => {
    const data = await post<MessageFeedback>("/feedback", {
      message_id: messageId,
      is_positive: isPositive,
      comment: comment || null,
    });
    set((s) => ({
      feedbackMap: { ...s.feedbackMap, [messageId]: data },
    }));
  },

  removeFeedback: async (messageId: string) => {
    await del(`/feedback/${messageId}`);
    set((s) => {
      const next = { ...s.feedbackMap };
      delete next[messageId];
      return { feedbackMap: next };
    });
  },

  getFeedback: (messageId: string) => {
    return getState().feedbackMap[messageId];
  },
}));
