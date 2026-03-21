import { useState, useRef, useEffect } from "react";
import { useChatStore } from "@/store/chatStore";
import { Send, StopCircle, ChevronDown, Paperclip, X, FileText, Image, Loader2 } from "lucide-react";
import { uploadFile } from "@/api/client";
import { toast } from "sonner";
import { TemplateSelector } from "./TemplateSelector";
import { AgentSelector } from "./AgentSelector";

interface UploadResponse {
  filename: string;
  size: number;
  extension: string;
  text: string;
  truncated: boolean;
  image_url?: string;
}

const ACCEPTED_TYPES = ".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.txt,.csv,.md,.json,.xml,.html,.rtf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg";
const ACCEPTED_EXTENSIONS = new Set(ACCEPTED_TYPES.split(","));

export function ChatInput() {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showModels, setShowModels] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; text: string; truncated: boolean; image_url?: string }[]>([]);
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
    attachmentsMaxSizeMb,
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
    if (attachedFile.length > 0) {
      const fileParts = attachedFile.map((f) => {
        if (f.image_url) {
          return `[Attached image: ${f.name}]\n\n![${f.name}](${f.image_url})`;
        }
        return `[Attached file: ${f.name}]\n\n--- File Content ---\n${f.text}\n--- End of File ---`;
      });
      messageContent = `${fileParts.join("\n\n")}\n\n${trimmed}`;
      setAttachedFile([]);
    }

    setInput("");
    await sendMessageStream(messageContent, selectedModel || undefined);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);  // snapshot before clearing
    e.target.value = "";

    setIsUploading(true);
    try {
      for (const file of fileArray) {
        if (file.size > attachmentsMaxSizeMb * 1024 * 1024) {
          toast.error(`${file.name}: File too large (max ${attachmentsMaxSizeMb} MB)`);
          continue;
        }
        const ext = "." + file.name.split(".").pop()?.toLowerCase();
        if (!ACCEPTED_EXTENSIONS.has(ext)) {
          toast.error(`${file.name}: Unsupported file type`);
          continue;
        }
        const toastId = toast.loading(`Uploading ${file.name}...`);
        try {
          const res = await uploadFile<UploadResponse>("/chat/upload", file);
          toast.dismiss(toastId);
          if (res.image_url) {
            setAttachedFile((prev) => [...prev, { name: res.filename, text: "", truncated: false, image_url: res.image_url }]);
          } else {
            if (!res.text || res.text.trim().length === 0) {
              toast.error(`${file.name}: Could not extract text`);
              continue;
            }
            setAttachedFile((prev) => [...prev, { name: res.filename, text: res.text, truncated: res.truncated }]);
            if (res.truncated) {
              toast.info(`${file.name} was truncated due to length.`);
            }
          }
        } catch (uploadErr) {
          toast.dismiss(toastId);
          const msg = uploadErr instanceof Error ? uploadErr.message : "Upload failed";
          console.error(`[Attachment] Upload failed for ${file.name}:`, uploadErr);
          toast.error(`${file.name}: ${msg}`);
        }
      }
      textareaRef.current?.focus();
    } catch (err: unknown) {
      console.error("[Attachment] Unexpected error:", err);
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachedFile((prev) => prev.filter((_, i) => i !== index));
  };

  const handleTemplateSelect = (content: string) => {
    setInput(content);
    textareaRef.current?.focus();
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
            <AgentSelector />
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

        {/* Attached files preview */}
        {attachmentsEnabled && attachedFile.length > 0 && (
          <div className="flex items-center gap-2 mb-2 px-1 flex-wrap">
            {attachedFile.map((f, i) => (
              <div key={i} className="relative flex items-center gap-2 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 rounded-lg px-3 py-1.5 text-sm">
                {f.image_url ? (
                  <>
                    <img src={f.image_url} alt={f.name} className="h-10 w-10 rounded object-cover shrink-0" />
                    <span className="text-primary-700 dark:text-primary-300 truncate max-w-[200px]">{f.name}</span>
                  </>
                ) : (
                  <>
                    <FileText size={14} className="text-primary-600 dark:text-primary-400 shrink-0" />
                    <span className="text-primary-700 dark:text-primary-300 truncate max-w-[250px]">{f.name}</span>
                  </>
                )}
                <button
                  onClick={() => removeAttachment(i)}
                  className="text-primary-400 hover:text-red-500 transition-colors shrink-0"
                  aria-label="Remove attachment"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
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
            aria-label="Attach files"
            multiple
          />
        )}

        <div className="flex items-end gap-2 bg-surface-50 dark:bg-surface-800 rounded-2xl border border-surface-200 dark:border-surface-700 px-4 py-2 focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent transition-all relative">
          {/* Template selector */}
          <TemplateSelector onSelect={handleTemplateSelect} />

          {/* Attach button */}
          {attachmentsEnabled && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isStreaming}
              className="p-2 rounded-xl text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              aria-label="Attach file"
              title="Attach a file (PDF, DOCX, XLSX, PPTX, TXT, CSV, Images, etc.)"
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
