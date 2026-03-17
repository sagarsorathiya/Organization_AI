import { useState, useRef, useEffect } from "react";
import { useChatStore } from "@/store/chatStore";
import { Send, StopCircle, ChevronDown, Paperclip, X, FileText, Loader2 } from "lucide-react";
import { uploadFile } from "@/api/client";
import { toast } from "sonner";

interface UploadResponse {
  filename: string;
  size: number;
  extension: string;
  text: string;
  truncated: boolean;
}

const ACCEPTED_TYPES = ".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.txt,.csv,.md,.json,.xml,.html,.rtf";
const ACCEPTED_EXTENSIONS = new Set(ACCEPTED_TYPES.split(","));
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function ChatInput() {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showModels, setShowModels] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; text: string; truncated: boolean } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const {
    sendMessageStream,
    stopStreaming,
    isStreaming,
    availableModels,
    defaultModel,
    selectedModel,
    setSelectedModel,
    loadModels,
    clearChat,
    attachmentsEnabled,
    loadAttachmentsEnabled,
  } = useChatStore();

  const [modelsLoading, setModelsLoading] = useState(true);

  // Load models and attachment setting on mount
  useEffect(() => {
    loadModels().finally(() => setModelsLoading(false));
    loadAttachmentsEnabled();
  }, [loadModels, loadAttachmentsEnabled]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Shift+N: New chat
      if (e.ctrlKey && e.shiftKey && e.key === "N") {
        e.preventDefault();
        clearChat();
      }
      // Ctrl+K: Focus search input
      if (e.ctrlKey && e.key === "k") {
        e.preventDefault();
        textareaRef.current?.focus();
      }
      // Escape: Stop streaming
      if (e.key === "Escape" && isStreaming) {
        stopStreaming();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [clearChat, stopStreaming, isStreaming]);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    let messageContent = trimmed;
    if (attachedFile) {
      messageContent = `[Attached file: ${attachedFile.name}]\n\n--- File Content ---\n${attachedFile.text}\n--- End of File ---\n\n${trimmed}`;
      setAttachedFile(null);
    }

    setInput("");
    await sendMessageStream(messageContent, selectedModel || undefined);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected
    e.target.value = "";

    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum size is 10 MB.");
      return;
    }

    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.has(ext)) {
      toast.error(`Unsupported file type: ${ext}. Accepted: ${ACCEPTED_TYPES}`);
      return;
    }

    setIsUploading(true);
    try {
      const res = await uploadFile<UploadResponse>("/chat/upload", file);
      if (!res.text || res.text.trim().length === 0) {
        toast.error("Could not extract text from this file.");
        return;
      }
      setAttachedFile({ name: res.filename, text: res.text, truncated: res.truncated });
      if (res.truncated) {
        toast.info("File was truncated due to length. First 50,000 characters included.");
      }
      textareaRef.current?.focus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const removeAttachment = () => {
    setAttachedFile(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const activeModel = selectedModel || defaultModel;

  return (
    <div className="border-t bg-white dark:bg-surface-900 px-4 py-3">
      <div className="max-w-3xl mx-auto">
        {/* Model selector */}
        {modelsLoading ? (
          <div className="mb-2">
            <div className="h-7 w-36 bg-surface-100 dark:bg-surface-800 rounded-lg animate-pulse" />
          </div>
        ) : availableModels.length > 0 && (
          <div className="relative mb-2 flex items-center gap-2">
            <button
              onClick={() => setShowModels(!showModels)}
              className="flex items-center gap-1 text-xs text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 bg-surface-100 dark:bg-surface-800 px-2.5 py-1 rounded-lg transition-colors"
              aria-label="Select model"
            >
              <span className="truncate max-w-[200px]">{activeModel || "Select model"}</span>
              <ChevronDown size={12} />
            </button>
            {showModels && (
              <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto min-w-[200px]">
                {availableModels.map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setSelectedModel(m === defaultModel ? null : m);
                      setShowModels(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-100 dark:hover:bg-surface-700 ${
                      (selectedModel || defaultModel) === m
                        ? "text-primary-600 dark:text-primary-400 font-medium"
                        : "text-surface-700 dark:text-surface-300"
                    }`}
                  >
                    {m}
                    {m === defaultModel && (
                      <span className="text-xs text-surface-400 ml-1">(default)</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Attached file preview */}
        {attachmentsEnabled && attachedFile && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="flex items-center gap-2 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 rounded-lg px-3 py-1.5 text-sm">
              <FileText size={14} className="text-primary-600 dark:text-primary-400 shrink-0" />
              <span className="text-primary-700 dark:text-primary-300 truncate max-w-[250px]">
                {attachedFile.name}
              </span>
              <button
                onClick={removeAttachment}
                className="text-primary-400 hover:text-red-500 transition-colors shrink-0"
                aria-label="Remove attachment"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Hidden file input */}
        {attachmentsEnabled && (
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={handleFileSelect}
            className="hidden"
            aria-label="Attach file"
          />
        )}

        <div className="flex items-end gap-2 bg-surface-50 dark:bg-surface-800 rounded-2xl border border-surface-200 dark:border-surface-700 px-4 py-2 focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent transition-all">
          {/* Attach button */}
          {attachmentsEnabled && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isStreaming}
              className="p-2 rounded-xl text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              aria-label="Attach file"
              title="Attach a document (PDF, DOCX, XLSX, PPTX, TXT, CSV, etc.)"
            >
              {isUploading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Paperclip size={18} />
              )}
            </button>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (Ctrl+K to focus)"
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-surface-800 dark:text-surface-100 placeholder-surface-400 dark:placeholder-surface-500 text-sm leading-relaxed py-1.5 max-h-[200px]"
            disabled={isStreaming}
            aria-label="Message input"
          />
          {isStreaming ? (
            <button
              onClick={stopStreaming}
              className="p-2 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors shrink-0"
              aria-label="Stop generating"
            >
              <StopCircle size={18} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="p-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          )}
        </div>
        <p className="text-xs text-surface-400 text-center mt-2">
          All conversations are private and processed locally within your organization.
        </p>
      </div>
    </div>
  );
}
