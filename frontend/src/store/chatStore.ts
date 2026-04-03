import { create } from "zustand";
import type { Conversation, Message, MessageAttachment, StreamChunk, ModelsResponse } from "@/types";
import { get, post, patch, del, postStream } from "@/api/client";
import { useAgentStore } from "@/store/agentStore";

type GeneratedFormat = "pdf" | "docx" | "xlsx" | "html";

function inferRequestedFormats(prompt: string): GeneratedFormat[] {
  const text = (prompt || "").toLowerCase();
  const wantsCreate = /(create|generate|make|build|produce|export|prepare)/i.test(text);
  if (!wantsCreate) return [];

  const formats = new Set<GeneratedFormat>();
  if (/\bpdf\b|portable document/i.test(text)) formats.add("pdf");
  if (/\bdoc\b|\bdocx\b|word document|microsoft word|ms word/i.test(text)) formats.add("docx");
  if (/\bexcel\b|\bxlsx\b|spreadsheet/i.test(text)) formats.add("xlsx");
  if (/\bhtml\b|web page|webpage/i.test(text)) formats.add("html");

  return Array.from(formats);
}

function defaultFileName(format: GeneratedFormat): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `assistant-output-${ts}.${format}`;
}

function extractVisionImages(attachments?: MessageAttachment[]): string[] {
  if (!attachments || attachments.length === 0) return [];

  const images: string[] = [];
  for (const att of attachments) {
    if (att.type !== "image" || !att.url) continue;
    const match = att.url.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    if (match?.[1]) {
      images.push(match[1]);
    }
  }
  return images;
}

interface GeneratedFileResponse {
  id: string;
  name: string;
  type: "document";
  url: string;
}

async function generateResponseFiles(
  content: string,
  formats: GeneratedFormat[],
  conversationId: string,
  messageId: string,
): Promise<MessageAttachment[]> {
  const attachments: MessageAttachment[] = [];

  for (const format of formats) {
    try {
      const name = defaultFileName(format);
      const file = await post<GeneratedFileResponse>("/chat/generate-file", {
        content,
        format,
        conversation_id: conversationId,
        message_id: messageId,
        filename: name,
      });
      attachments.push({ name: file.name, type: "document", url: file.url });
    } catch {
      // Skip failed formats and keep the rest.
    }
  }

  return attachments;
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isStreaming: boolean;
  streamingContent: string;
  streamingPhase: string | null;
  error: string | null;
  _abortController: AbortController | null;
  sidebarSearch: string;
  availableModels: string[];
  defaultModel: string;
  selectedModel: string | null;
  attachmentsEnabled: boolean;
  attachmentsMaxSizeMb: number;
  deepAnalysisMode: boolean;
  lastFailedPrompt: string | null;
  lastFailedModel: string | null;
  lastFailedOptions?: { displayContent?: string; attachments?: MessageAttachment[] };

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
  setDeepAnalysisMode: (enabled: boolean) => void;
  retryLastRequest: (mode?: "same" | "fast" | "deep") => Promise<void>;
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
  streamingPhase: null,
  error: null,
  _abortController: null,
  sidebarSearch: "",
  availableModels: [],
  defaultModel: "",
  selectedModel: null,
  attachmentsEnabled: true,
  attachmentsMaxSizeMb: 10,
  deepAnalysisMode: false,
  lastFailedPrompt: null,
  lastFailedModel: null,
  lastFailedOptions: undefined,

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
        deep_analysis: state.deepAnalysisMode,
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
    set({ _abortController: null, isStreaming: false, streamingContent: "", streamingPhase: null });
  },

  sendMessageStream: async (content: string, model?: string, options?: { displayContent?: string; attachments?: MessageAttachment[] }) => {
    const state = getState();
    if (state.isStreaming) return; // F11: prevent race condition
    const abortController = new AbortController();
    set({ isStreaming: true, streamingContent: "", streamingPhase: null, _abortController: abortController });

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
        deep_analysis: state.deepAnalysisMode,
        vision_images: extractVisionImages(options?.attachments),
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
        } else if (chunk.type === "phase") {
          set({ streamingPhase: chunk.phase });
        } else if (chunk.type === "reset") {
          fullContent = "";
          set({ streamingContent: "" });
        } else if (chunk.type === "done") {
          // Add final assistant message
          const assistantMsg: Message = {
            id: chunk.message_id,
            conversation_id: convId,
            role: "assistant",
            content: fullContent,
            model: chunk.model || model || null,
            token_count: null,
            created_at: new Date().toISOString(),
            citations: chunk.citations || [],
            quality_issues: chunk.quality_issues || [],
            followups: chunk.followups || [],
          };
          set((s) => ({
            messages: [...s.messages, assistantMsg],
            isStreaming: false,
            streamingContent: "",
            streamingPhase: null,
            _abortController: null,
            lastFailedPrompt: null,
            lastFailedModel: null,
            lastFailedOptions: undefined,
          }));

          // If the user's prompt asked for a file, generate downloadable outputs.
          const latestUser = [...getState().messages]
            .reverse()
            .find((m) => m.role === "user");
          const userPrompt = latestUser?.displayContent || latestUser?.content || "";
          const requestedFormats = inferRequestedFormats(userPrompt);
          if (requestedFormats.length > 0 && fullContent.trim().length > 0) {
            const generated = await generateResponseFiles(
              fullContent,
              requestedFormats,
              convId,
              assistantMsg.id,
            );
            if (generated.length > 0) {
              set((s) => ({
                messages: s.messages.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, attachments: [...(m.attachments || []), ...generated] }
                    : m
                ),
              }));
            }
          }

          // Refresh conversations if new
          if (!state.activeConversationId) {
            await getState().loadConversations();
          }
          return; // stream complete
        } else if (chunk.type === "error") {
          set({
            isStreaming: false,
            streamingContent: "",
            streamingPhase: null,
            _abortController: null,
            error: chunk.content || "An error occurred while generating the response.",
            lastFailedPrompt: content,
            lastFailedModel: model || null,
            lastFailedOptions: options,
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
            streamingPhase: null,
            _abortController: null,
          }));
        } else {
          set({
            isStreaming: false,
            streamingContent: "",
            streamingPhase: null,
            _abortController: null,
            error: "Stream ended unexpectedly. Please try again.",
            lastFailedPrompt: content,
            lastFailedModel: model || null,
            lastFailedOptions: options,
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
          streamingPhase: null,
          _abortController: null,
        }));
      } else {
        set({
          isStreaming: false,
          streamingContent: "",
          streamingPhase: null,
          _abortController: null,
          error: wasAborted ? null : "Stream failed",
          lastFailedPrompt: wasAborted ? null : content,
          lastFailedModel: wasAborted ? null : (model || null),
          lastFailedOptions: wasAborted ? undefined : options,
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

  setDeepAnalysisMode: (enabled: boolean) => set({ deepAnalysisMode: enabled }),

  retryLastRequest: async (mode = "same") => {
    const state = getState();
    if (!state.lastFailedPrompt) return;

    let retryModel = state.lastFailedModel || undefined;
    let retryDeep = state.deepAnalysisMode;

    if (mode === "fast") {
      const fast = state.availableModels.find((m) => /gemma4:e2b|gemma4:e4b|llama3\.2:3b/i.test(m));
      if (fast) retryModel = fast;
      retryDeep = false;
      set({ deepAnalysisMode: false });
    }

    if (mode === "deep") {
      retryDeep = true;
      set({ deepAnalysisMode: true });
    }

    // Ensure state reflects the retry strategy before dispatching request.
    if (retryDeep !== state.deepAnalysisMode) {
      set({ deepAnalysisMode: retryDeep });
    }

    await getState().sendMessageStream(
      state.lastFailedPrompt,
      retryModel,
      state.lastFailedOptions,
    );
  },

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
