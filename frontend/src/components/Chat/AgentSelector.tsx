import { useState, useRef, useEffect } from "react";
import { useAgentStore } from "@/store/agentStore";
import { Bot, ChevronDown, X } from "lucide-react";
import clsx from "clsx";

export function AgentSelector() {
  const { agents, selectedAgent, selectAgent, loadAgents, isLoading } = useAgentStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (agents.length === 0) loadAgents();
  }, [agents.length, loadAgents]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = agents.filter(
    (a) =>
      a.is_active &&
      (a.name.toLowerCase().includes(search.toLowerCase()) ||
        (a.category && a.category.toLowerCase().includes(search.toLowerCase())))
  );

  const categories = [...new Set(filtered.map((a) => a.category).filter(Boolean))];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors",
          selectedAgent
            ? "bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300"
            : "btn-ghost"
        )}
        title={selectedAgent ? `Agent: ${selectedAgent.name}` : "Select an AI Agent"}
      >
        {selectedAgent ? (
          <>
            <span>{selectedAgent.icon || "🤖"}</span>
            <span className="max-w-[100px] truncate">{selectedAgent.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                selectAgent(null);
              }}
              className="ml-1 p-0.5 rounded hover:bg-primary-200 dark:hover:bg-primary-800"
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <>
            <Bot size={16} />
            <span className="hidden sm:inline">Agent</span>
            <ChevronDown size={14} />
          </>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-72 card p-2 z-50 shadow-lg max-h-80 overflow-hidden flex flex-col">
          <input
            type="text"
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field text-sm mb-2"
            autoFocus
          />
          <div className="overflow-y-auto flex-1 space-y-1">
            {isLoading ? (
              <p className="text-sm text-surface-500 text-center py-4">Loading...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-surface-500 text-center py-4">No agents found</p>
            ) : (
              categories.map((cat) => (
                <div key={cat}>
                  <p className="text-xs font-medium text-surface-400 uppercase px-2 py-1">
                    {cat}
                  </p>
                  {filtered
                    .filter((a) => a.category === cat)
                    .map((agent) => (
                      <button
                        key={agent.id}
                        onClick={() => {
                          selectAgent(agent);
                          setOpen(false);
                          setSearch("");
                        }}
                        className={clsx(
                          "w-full flex items-start gap-2 p-2 rounded-lg text-left transition-colors",
                          selectedAgent?.id === agent.id
                            ? "bg-primary-50 dark:bg-primary-900/30"
                            : "hover:bg-surface-100 dark:hover:bg-surface-800"
                        )}
                      >
                        <span className="text-lg flex-shrink-0 mt-0.5">
                          {agent.icon || "🤖"}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{agent.name}</p>
                          <p className="text-xs text-surface-500 line-clamp-2">
                            {agent.description}
                          </p>
                        </div>
                      </button>
                    ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
