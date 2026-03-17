import { useState } from "react";
import { Keyboard, X } from "lucide-react";

const shortcuts = [
  { keys: ["Ctrl", "Shift", "N"], desc: "New conversation" },
  { keys: ["Ctrl", "K"], desc: "Focus message input" },
  { keys: ["Enter"], desc: "Send message" },
  { keys: ["Shift", "Enter"], desc: "New line in message" },
  { keys: ["Escape"], desc: "Stop streaming / close modal" },
  { keys: ["Ctrl", "/"], desc: "Toggle shortcuts panel" },
];

export function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-surface-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-surface-700">
          <div className="flex items-center gap-2">
            <Keyboard size={18} className="text-primary-600 dark:text-primary-400" />
            <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-100">
              Keyboard Shortcuts
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-700">
            <X size={18} className="text-surface-400" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {shortcuts.map(({ keys, desc }) => (
            <div key={desc} className="flex items-center justify-between">
              <span className="text-sm text-surface-600 dark:text-surface-300">{desc}</span>
              <div className="flex gap-1">
                {keys.map((k) => (
                  <kbd
                    key={k}
                    className="px-2 py-0.5 text-xs font-mono bg-surface-100 dark:bg-surface-700 border border-surface-300 dark:border-surface-600 rounded text-surface-600 dark:text-surface-300"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function KeyboardShortcutsButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 px-2 py-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800"
        title="Keyboard shortcuts (Ctrl+/)"
      >
        <Keyboard size={12} />
        <span>Shortcuts</span>
      </button>
      {open && <KeyboardShortcutsModal onClose={() => setOpen(false)} />}
    </>
  );
}
