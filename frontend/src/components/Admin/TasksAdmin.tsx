import { useState, useEffect } from "react";
import { get, post, patch, del } from "@/api/client";
import type { ScheduledTask } from "@/types";
import {
  Clock, Plus, Trash2, Edit3, Play, Loader2, ToggleLeft, ToggleRight, X, Save,
} from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";

export function TasksAdmin() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTask, setEditingTask] = useState<Partial<ScheduledTask> | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    setIsLoading(true);
    try {
      const data = await get<{ tasks: ScheduledTask[] }>("/admin/tasks");
      setTasks(data.tasks);
    } catch {
      toast.error("Failed to load tasks");
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    if (!editingTask?.name || !editingTask?.task_type || !editingTask?.cron_expression) {
      toast.error("Name, task type, and cron expression are required");
      return;
    }
    try {
      if (isNew) {
        const created = await post<ScheduledTask>("/admin/tasks", editingTask);
        setTasks((prev) => [created, ...prev]);
        toast.success("Task created");
      } else if (editingTask.id) {
        const updated = await patch<ScheduledTask>(`/admin/tasks/${editingTask.id}`, editingTask);
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        toast.success("Task updated");
      }
      setEditingTask(null);
      setIsNew(false);
    } catch {
      toast.error("Failed to save task");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this scheduled task?")) return;
    try {
      await del(`/admin/tasks/${id}`);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      toast.success("Task deleted");
    } catch {
      toast.error("Failed to delete task");
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      await post(`/admin/tasks/${id}/run-now`, {});
      toast.success("Task triggered");
      setTimeout(loadTasks, 3000);
    } catch {
      toast.error("Failed to trigger task");
    }
  };

  const handleToggle = async (task: ScheduledTask) => {
    try {
      await patch(`/admin/tasks/${task.id}`, { is_active: !task.is_active });
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, is_active: !t.is_active } : t))
      );
    } catch {
      toast.error("Failed to toggle task");
    }
  };

  if (editingTask) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200">{isNew ? "Create New Task" : "Edit Task"}</h3>
          <button onClick={() => { setEditingTask(null); setIsNew(false); }} className="btn-ghost p-1.5 rounded-md">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4">
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Task Configuration</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block text-surface-600 dark:text-surface-300">Name</label>
              <input
                value={editingTask.name || ""}
                onChange={(e) => setEditingTask({ ...editingTask, name: e.target.value })}
                className="input-field text-sm"
                placeholder="Task name"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block text-surface-600 dark:text-surface-300">Task Type</label>
              <select
                value={editingTask.task_type || ""}
                onChange={(e) => setEditingTask({ ...editingTask, task_type: e.target.value })}
                className="input-field text-sm"
              >
                <option value="">Select...</option>
                <option value="memory_cleanup">Memory Cleanup</option>
                <option value="usage_report">Usage Report</option>
                <option value="stale_knowledge_check">Stale Knowledge Check</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Schedule</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block text-surface-600 dark:text-surface-300">Cron Expression</label>
              <input
                value={editingTask.cron_expression || ""}
                onChange={(e) => setEditingTask({ ...editingTask, cron_expression: e.target.value })}
                className="input-field text-sm font-mono"
                placeholder="0 0 * * *"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block text-surface-600 dark:text-surface-300">Timezone</label>
              <input
                value={editingTask.timezone || "UTC"}
                onChange={(e) => setEditingTask({ ...editingTask, timezone: e.target.value })}
                className="input-field text-sm"
              />
            </div>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block text-surface-600 dark:text-surface-300">Description</label>
          <textarea
            value={editingTask.description || ""}
            onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
            className="input-field text-sm min-h-[60px]"
            placeholder="What does this task do?"
          />
        </div>
        <div className="flex items-center gap-3 pt-2 border-t border-surface-100 dark:border-surface-800">
          <button onClick={handleSave} className="btn-primary flex items-center gap-2">
            <Save size={16} />
            {isNew ? "Create Task" : "Save Changes"}
          </button>
          <button onClick={() => { setEditingTask(null); setIsNew(false); }} className="btn-ghost text-sm">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-surface-500">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</p>
        <button
          onClick={() => {
            setEditingTask({
              name: "",
              task_type: "",
              cron_expression: "",
              timezone: "UTC",
              description: "",
            });
            setIsNew(true);
          }}
          className="btn-primary text-sm flex items-center gap-1.5"
        >
          <Plus size={14} />
          New Task
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-surface-400" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12">
          <Clock size={36} className="mx-auto text-surface-300 dark:text-surface-600 mb-3" />
          <p className="text-sm font-medium text-surface-500">No scheduled tasks</p>
          <p className="text-xs text-surface-400 mt-1">Create automated tasks for recurring operations</p>
        </div>
      ) : (
        <div className="divide-y divide-surface-100 dark:divide-surface-800">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 py-3 px-1 group"
            >
              <div className={clsx(
                "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                task.is_active
                  ? "bg-green-50 dark:bg-green-900/20"
                  : "bg-surface-50 dark:bg-surface-800"
              )}>
                <Clock size={16} className={clsx(task.is_active ? "text-green-500" : "text-surface-400")} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-surface-800 dark:text-surface-100">{task.name}</p>
                  {task.is_active ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 font-medium">
                      active
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-100 dark:bg-surface-800 text-surface-500 font-medium">
                      paused
                    </span>
                  )}
                </div>
                <p className="text-xs text-surface-400 mt-0.5 font-mono">
                  {task.cron_expression}
                  <span className="font-sans"> · {task.task_type} · {task.run_count} runs
                  {task.last_status && ` · Last: ${task.last_status}`}</span>
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleToggle(task)} className="btn-ghost p-1.5 rounded-md" title={task.is_active ? "Disable" : "Enable"}>
                  {task.is_active ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
                </button>
                <button onClick={() => handleRunNow(task.id)} className="btn-ghost p-1.5 rounded-md" title="Run now">
                  <Play size={14} />
                </button>
                <button onClick={() => { setEditingTask(task); setIsNew(false); }} className="btn-ghost p-1.5 rounded-md" title="Edit">
                  <Edit3 size={14} />
                </button>
                <button onClick={() => handleDelete(task.id)} className="btn-ghost p-1.5 rounded-md text-red-500" title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
