import { create } from "zustand";
import type { Conversation, Message, MessageAttachment, StreamChunk, ModelsResponse } from "@/types";
import { get, post, patch, del, postStream } from "@/api/client";
import { useAgentStore } from "@/store/agentStore";

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;
  _abortController: AbortController | null;
  sidebarSearch: string;
  availableModels: string[];
  defaultModel: string;
  selectedModel: string | null;
  attachmentsEnabled: boolean;
  attachmentsMaxSizeMb: number;

  loadConversations: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  createConversation: (title?: string) => Promise<Conversation>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  pinConversation: (id: string, pinned: boolean) => Promise<void>;
  archiveConversation: (id: string) => Promise<void>;
  sendMessage: (content: string, model?: string) => Promise<void>;
  sendMessageStream: (content: string, model?: string, options?: { displayContent?: string; attachments?: MessageAttachment[] }) => Promise<void>;
  editAndResend: (messageId: string, newContent: string) => Promise<void>;
  stopStreaming: () => void;
  clearChat: () => void;
  setError: (error: string | null) => void;
  setSidebarSearch: (q: string) => void;
  loadModels: () => Promise<void>;
  setSelectedModel: (model: string | null) => void;
  loadAttachmentsEnabled: () => Promise<void>;
  getFilteredConversations: () => Conversation[];
}

export const useChatStore = create<ChatState>((set, getState) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  isLoadingConversations: false,
  isLoadingMessages: false,
  isStreaming: false,
  streamingContent: "",
  error: null,
  _abortController: null,
  sidebarSearch: "",
  availableModels: [],
  defaultModel: "",
  selectedModel: null,
  attachmentsEnabled: true,
  attachmentsMaxSizeMb: 10,

  loadConversations: async () => {
    set({ isLoadingConversations: true });
    try {
      const data = await get<{ conversations: Conversation[]; total: number }>(
        "/conversations?archived=true"
      );
      set({ conversations: data.conversations, isLoadingConversations: false });
    } catch (e: unknown) {
      set({ isLoadingConversations: false, error: "Failed to load conversations" });
    }
  },

  selectConversation: async (id: string) => {
    set({ activeConversationId: id, isLoadingMessages: true, messages: [] });
    try {
      const data = await get<{ messages: Message[] }>(`/conversations/${id}`);
      set({ messages: data.messages, isLoadingMessages: false });
    } catch {
      set({ isLoadingMessages: false, error: "Failed to load messages" });
    }
  },

  createConversation: async (title?: string) => {
    const data = await post<Conversation>("/conversations", {
      title: title || "New Conversation",
    });
    set((state) => ({
      conversations: [data, ...state.conversations],
      activeConversationId: data.id,
      messages: [],
    }));
    return data;
  },

  renameConversation: async (id: string, title: string) => {
    await patch(`/conversations/${id}`, { title });
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    }));
  },

  deleteConversation: async (id: string) => {
    await del(`/conversations/${id}`);
    const state = getState();
    const remaining = state.conversations.filter((c) => c.id !== id);
    set({
      conversations: remaining,
      activeConversationId:
        state.activeConversationId === id ? null : state.activeConversationId,
      messages: state.activeConversationId === id ? [] : state.messages,
    });
  },

  pinConversation: async (id: string, pinned: boolean) => {
    await patch(`/conversations/${id}/pin`, { is_pinned: pinned });
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, is_pinned: pinned } : c
      ),
    }));
  },

  archiveConversation: async (id: string) => {
    const data = await patch<Conversation>(`/conversations/${id}/archive`, {});
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, archived_at: data.archived_at } : c
      ),
      activeConversationId:
        data.archived_at && state.activeConversationId === id
          ? null
          : state.activeConversationId,
      messages:
        data.archived_at && state.activeConversationId === id
          ? []
          : state.messages,
    }));
  },

  sendMessage: async (content: string, model?: string) => {
    const state = getState();

    // Optimistically add user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: state.activeConversationId || "",
      role: "user",
      content,
      model: null,
      token_count: null,
      created_at: new Date().toISOString(),
    };
    set((s) => ({ messages: [...s.messages, tempUserMsg] }));

    try {
      const agentId = useAgentStore.getState().selectedAgent?.id;
      const data = await post<{
        message: Message;
        conversation_id: string;
      }>("/chat", {
        message: content,
        conversation_id: state.activeConversationId,
        model,
        agent_id: agentId || undefined,
      });

      // If this was a new conversation, update the ID
      if (!state.activeConversationId) {
        set({ activeConversationId: data.conversation_id });
        await getState().loadConversations();
      }

      // Replace temp msg and add assistant response
      set((s) => ({
        messages: [
          ...s.messages.filter((m) => m.id !== tempUserMsg.id),
          { ...tempUserMsg, id: `user-${Date.now()}`, conversation_id: data.conversation_id },
          data.message,
        ],
      }));
    } catch (e: unknown) {
      set((s) => ({
        messages: s.messages.filter((m) => m.id !== tempUserMsg.id),
        error: "Failed to send message",
      }));
    }
  },

  stopStreaming: () => {
    const { _abortController } = getState();
    if (_abortController) {
      _abortController.abort();
    }
    set({ _abortController: null, isStreaming: false, streamingContent: "" });
  },

  sendMessageStream: async (content: string, model?: string, options?: { displayContent?: string; attachments?: MessageAttachment[] }) => {
    const state = getState();
    if (state.isStreaming) return; // F11: prevent race condition
    const abortController = new AbortController();
    set({ isStreaming: true, streamingContent: "", _abortController: abortController });

    // Add optimistic user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: state.activeConversationId || "",
      role: "user",
      content,
      model: null,
      token_count: null,
      created_at: new Date().toISOString(),
      displayContent: options?.attachments ? options.displayContent : undefined,
      attachments: options?.attachments,
    };
    set((s) => ({ messages: [...s.messages, tempUserMsg] }));

    let convId = state.activeConversationId || "";

    try {
      let fullContent = "";

      const agentId = useAgentStore.getState().selectedAgent?.id;
      const stream = postStream<StreamChunk>("/chat/stream", {
        message: content,
        conversation_id: state.activeConversationId,
        model,
        agent_id: agentId || undefined,
      }, abortController.signal);

      for await (const chunk of stream) {
        if (chunk.type === "meta") {
          convId = chunk.conversation_id;
          if (!state.activeConversationId) {
            set({ activeConversationId: convId });
          }
        } else if (chunk.type === "token") {
          fullContent += chunk.content;
          set({ streamingContent: fullContent });
        } else if (chunk.type === "done") {
          // Add final assistant message
          const assistantMsg: Message = {
            id: chunk.message_id,
            conversation_id: convId,
            role: "assistant",
            content: fullContent,
            model: model || null,
            token_count: null,
            created_at: new Date().toISOString(),
          };
          set((s) => ({
            messages: [...s.messages, assistantMsg],
            isStreaming: false,
            streamingContent: "",
            _abortController: null,
          }));

          // Refresh conversations if new
          if (!state.activeConversationId) {
            await getState().loadConversations();
          }
          return; // stream complete
        } else if (chunk.type === "error") {
          set({
            isStreaming: false,
            streamingContent: "",
            _abortController: null,
            error: chunk.content || "An error occurred while generating the response.",
          });
          return;
        }
      }

      // Safety: if stream ended without a "done" or "error" chunk, clean up
      if (getState().isStreaming) {
        const partial = getState().streamingContent;
        if (partial) {
          const partialMsg: Message = {
            id: `partial-${Date.now()}`,
            conversation_id: convId || state.activeConversationId || "",
            role: "assistant",
            content: partial,
            model: model || null,
            token_count: null,
            created_at: new Date().toISOString(),
          };
          set((s) => ({
            messages: [...s.messages, partialMsg],
            isStreaming: false,
            streamingContent: "",
            _abortController: null,
          }));
        } else {
          set({
            isStreaming: false,
            streamingContent: "",
            _abortController: null,
            error: "Stream ended unexpectedly. Please try again.",
          });
        }
      }
    } catch (e: unknown) {
      const wasAborted = abortController.signal.aborted;
      const currentContent = getState().streamingContent;
      // If user stopped mid-stream, keep what was generated so far
      if (wasAborted && currentContent) {
        const assistantMsg: Message = {
          id: `stopped-${Date.now()}`,
          conversation_id: convId || state.activeConversationId || "",
          role: "assistant",
          content: currentContent,
          model: model || null,
          token_count: null,
          created_at: new Date().toISOString(),
        };
        set((s) => ({
          messages: [...s.messages, assistantMsg],
          isStreaming: false,
          streamingContent: "",
          _abortController: null,
        }));
      } else {
        set({
          isStreaming: false,
          streamingContent: "",
          _abortController: null,
          error: wasAborted ? null : "Stream failed",
        });
      }
    }
  },

  editAndResend: async (messageId: string, newContent: string) => {
    const state = getState();
    const msgIndex = state.messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    // Keep messages before the edited one, replace the edited user message
    const kept = state.messages.slice(0, msgIndex);
    const editedMsg: Message = {
      ...state.messages[msgIndex],
      content: newContent,
    };
    set({ messages: [...kept, editedMsg] });

    // Re-send with the new content
    await getState().sendMessageStream(newContent, state.selectedModel || undefined);
  },

  clearChat: () => {
    set({ activeConversationId: null, messages: [], streamingContent: "" });
  },

  setError: (error) => set({ error }),

  setSidebarSearch: (q: string) => set({ sidebarSearch: q }),

  loadModels: async () => {
    try {
      const data = await get<ModelsResponse>("/chat/models");
      set({ availableModels: data.models, defaultModel: data.default });
    } catch {
      // silently fail — model selector just won't show
    }
  },

  setSelectedModel: (model: string | null) => set({ selectedModel: model }),

  loadAttachmentsEnabled: async () => {
    try {
      const data = await get<{ enabled: boolean; max_size_mb: number }>("/chat/attachments-enabled");
      set({ attachmentsEnabled: data.enabled, attachmentsMaxSizeMb: data.max_size_mb ?? 10 });
    } catch {
      // default to true if endpoint fails
    }
  },

  getFilteredConversations: () => {
    const { conversations, sidebarSearch } = getState();
    if (!sidebarSearch.trim()) return conversations;
    const q = sidebarSearch.toLowerCase();
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.last_message_preview && c.last_message_preview.toLowerCase().includes(q))
    );
  },
}));
