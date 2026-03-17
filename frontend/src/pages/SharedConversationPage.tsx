import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Bot, Lock, Shield } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface SharedMessage {
  role: string;
  content: string;
  model: string | null;
  created_at: string;
}

interface SharedConvData {
  title: string;
  created_at: string;
  messages: SharedMessage[];
}

export function SharedConversationPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedConvData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/share/view/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error("Conversation not found");
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-50 dark:bg-surface-900 flex items-center justify-center">
        <div className="animate-pulse text-surface-500">Loading shared conversation...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-surface-50 dark:bg-surface-900 flex items-center justify-center">
        <div className="text-center">
          <Lock size={48} className="mx-auto text-surface-300 mb-4" />
          <h2 className="text-xl font-semibold text-surface-700 dark:text-surface-200">
            {error || "Conversation not found"}
          </h2>
          <p className="text-surface-400 mt-2">This shared link may have been revoked or expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900">
      <header className="border-b bg-white dark:bg-surface-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Bot size={24} className="text-primary-600 dark:text-primary-400" />
          <div>
            <h1 className="font-semibold text-surface-800 dark:text-surface-100">{data.title}</h1>
            <div className="flex items-center gap-2 text-xs text-surface-400">
              <Shield size={10} />
              <span>Shared read-only conversation</span>
              <span>·</span>
              <span>{new Date(data.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {data.messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${msg.role === "user" ? "bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300" : "bg-emerald-100 dark:bg-emerald-900/40"}`}>
              {msg.role === "user" ? "U" : <Bot size={16} className="text-emerald-600 dark:text-emerald-400" />}
            </div>
            <div className={`flex-1 min-w-0 ${msg.role === "user" ? "text-right" : ""}`}>
              <div className={`inline-block text-left rounded-2xl px-4 py-3 max-w-full ${msg.role === "user" ? "bg-primary-600 text-white rounded-tr-md" : "bg-surface-100 dark:bg-surface-800 text-surface-800 dark:text-surface-200 rounded-tl-md"}`}>
                {msg.role === "user" ? (
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                ) : (
                  <div className="prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
              <div className={`text-[10px] text-surface-400 mt-1 ${msg.role === "user" ? "text-right" : ""}`}>
                {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {msg.model && msg.role === "assistant" && <span className="ml-2">{msg.model}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
