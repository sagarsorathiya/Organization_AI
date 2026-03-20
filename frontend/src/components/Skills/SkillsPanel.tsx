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
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            {lastResult.status === "completed" ? (
              <CheckCircle size={18} className="text-green-500" />
            ) : (
              <XCircle size={18} className="text-red-500" />
            )}
            Skill Result
          </h3>
          <button onClick={clearResult} className="btn-ghost px-3 py-1 text-sm">
            Back
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
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
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <span>{skill.icon || "⚡"}</span>
            {skill.name}
          </h3>
          <button onClick={() => setSelectedSkill(null)} className="btn-ghost px-3 py-1 text-sm">
            Back
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {skill.description && (
            <p className="text-sm text-surface-500">{skill.description}</p>
          )}
          {skill.input_schema &&
            Object.entries(skill.input_schema).map(([key, schema]) => (
              <div key={key}>
                <label className="block text-sm font-medium mb-1">{schema.label || key}</label>
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
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <h3 className="font-semibold flex items-center gap-2 mb-3">
          <Zap size={18} />
          Skills
        </h3>
        <input
          type="text"
          placeholder="Search skills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field text-sm"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-surface-400" />
          </div>
        ) : (
          categories.map((cat) => {
            const catSkills = filtered.filter((s) => s.category === cat);
            if (catSkills.length === 0) return null;
            return (
              <div key={cat} className="mb-3">
                <p className="text-xs font-medium text-surface-400 uppercase px-2 py-1">
                  {cat}
                </p>
                {catSkills.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedSkill(s.slug);
                      setInputs({});
                    }}
                    className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors text-left"
                  >
                    <span className="text-lg flex-shrink-0">{s.icon || "⚡"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-surface-500 truncate">{s.description}</p>
                    </div>
                    <ChevronRight size={14} className="text-surface-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
