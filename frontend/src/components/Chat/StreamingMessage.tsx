import { memo, useState, useEffect, useRef } from "react";
import { Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
}

/**
 * Throttled streaming message: renders markdown at most every 80ms
 * to prevent UI jank when tokens arrive faster than the renderer.
 */
export const StreamingMessage = memo(function StreamingMessage({ content }: Props) {
  const [rendered, setRendered] = useState(content);
  const rafRef = useRef<number | null>(null);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    const now = performance.now();
    const elapsed = now - lastUpdateRef.current;

    // If enough time has passed, update immediately
    if (elapsed >= 80) {
      setRendered(content);
      lastUpdateRef.current = now;
      return;
    }

    // Otherwise schedule an update for the remaining time
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      setRendered(content);
      lastUpdateRef.current = performance.now();
      rafRef.current = null;
    });

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [content]);

  // Always show the latest content when streaming finishes
  useEffect(() => {
    return () => setRendered(content);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex gap-3 py-4">
      <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0 mt-1">
        <Bot size={16} className="text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="inline-block text-left rounded-2xl rounded-tl-md px-4 py-3 bg-surface-100 dark:bg-surface-800 text-surface-800 dark:text-surface-200 max-w-full">
          {rendered ? (
            <div className="markdown-content prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {rendered}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-surface-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 bg-surface-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 bg-surface-400 rounded-full animate-bounce" />
              </div>
              <span className="text-sm text-surface-400 italic">Thinking...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
