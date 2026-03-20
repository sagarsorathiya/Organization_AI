import { useState, useEffect } from "react";
import { useSkillStore } from "@/store/skillStore";
import { Zap, Play, Loader2, ChevronRight, CheckCircle, XCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";

export function SkillsPanel() {
  const { skills, loadSkills, executeSkill, isLoading, isExecuting, lastResult, clearResult } =
    useSkillStore();
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (skills.length === 0) loadSkills();
  }, [skills.length, loadSkills]);

  const skill = skills.find((s) => s.slug === selectedSkill);
  const categories = [...new Set(skills.map((s) => s.category).filter(Boolean))];

  const filtered = skills.filter(
    (s) =>
      s.is_active &&
      (s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.category && s.category.toLowerCase().includes(search.toLowerCase())))
  );

  const handleExecute = async () => {
    if (!skill) return;
    await executeSkill(skill.slug, inputs);
  };

  if (lastResult) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            {lastResult.status === "completed" ? (
              <CheckCircle size={16} className="text-green-500" />
            ) : (
              <XCircle size={16} className="text-red-500" />
            )}
            Skill Result
          </h3>
          <button onClick={clearResult} className="btn-ghost px-3 py-1 text-sm">
            Back
          </button>
        </div>
        <div>
          {lastResult.status === "completed" && lastResult.result ? (
            <div className="prose dark:prose-invert max-w-none text-sm">
              <ReactMarkdown>{lastResult.result}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-red-500 text-sm">
              {lastResult.error_message || "Skill execution failed"}
            </div>
          )}
          {lastResult.duration_ms && (
            <p className="text-xs text-surface-400 mt-4">
              Completed in {(lastResult.duration_ms / 1000).toFixed(1)}s
            </p>
          )}
        </div>
      </div>
    );
  }

  if (skill) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <span>{skill.icon || "⚡"}</span>
            {skill.name}
          </h3>
          <button onClick={() => setSelectedSkill(null)} className="btn-ghost px-3 py-1 text-sm">
            Back
          </button>
        </div>
        <div className="space-y-4">
          {skill.description && (
            <p className="text-sm text-surface-500">{skill.description}</p>
          )}
          {skill.input_schema &&
            Object.entries(skill.input_schema).map(([key, schema]) => (
              <div key={key}>
                <label className="block text-xs font-medium mb-1 text-surface-600 dark:text-surface-300">{schema.label || key}</label>
                <textarea
                  value={inputs[key] || ""}
                  onChange={(e) => setInputs((p) => ({ ...p, [key]: e.target.value }))}
                  className="input-field text-sm min-h-[80px]"
                  placeholder={`Enter ${schema.label || key}...`}
                />
              </div>
            ))}
          <button
            onClick={handleExecute}
            disabled={isExecuting}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {isExecuting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play size={16} />
                Execute Skill
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <input
          type="text"
          placeholder="Search skills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field text-sm"
        />
      </div>
      <div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-surface-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Zap size={36} className="mx-auto text-surface-300 dark:text-surface-600 mb-3" />
            <p className="text-sm font-medium text-surface-500">No skills available</p>
            <p className="text-xs text-surface-400 mt-1">Skills will appear here when configured</p>
          </div>
        ) : (
          categories.map((cat) => {
            const catSkills = filtered.filter((s) => s.category === cat);
            if (catSkills.length === 0) return null;
            return (
              <div key={cat} className="mb-4">
                <p className="text-xs font-medium text-surface-400 uppercase tracking-wider px-1 py-1 mb-1">
                  {cat}
                </p>
                <div className="divide-y divide-surface-100 dark:divide-surface-800">
                  {catSkills.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSelectedSkill(s.slug);
                        setInputs({});
                      }}
                      className="w-full flex items-center gap-3 py-3 px-1 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-base">{s.icon || "⚡"}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-surface-800 dark:text-surface-100 truncate">{s.name}</p>
                        <p className="text-xs text-surface-400 truncate mt-0.5">{s.description}</p>
                      </div>
                      <ChevronRight size={14} className="text-surface-300 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
