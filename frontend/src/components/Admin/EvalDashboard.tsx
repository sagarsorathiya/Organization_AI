import { useCallback, useEffect, useMemo, useState } from "react";
import { get, post } from "@/api/client";
import type { EvalSummary, TraceSession, ActionExecutionRequest } from "@/types";
import { Activity, Clock, RefreshCw, ShieldCheck, PlayCircle, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

function formatTime(ts?: string | null): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString();
}

export function EvalDashboard() {
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  const [sessions, setSessions] = useState<TraceSession[]>([]);
  const [actions, setActions] = useState<ActionExecutionRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hours, setHours] = useState(24);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [newActionType, setNewActionType] = useState("read.preview");
  const [newPayload, setNewPayload] = useState('{"note":"example"}');
  const [requiresApproval, setRequiresApproval] = useState(true);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sum, traceData, actionData] = await Promise.all([
        get<EvalSummary>(`/admin/eval/summary?hours=${hours}`),
        get<{ sessions: TraceSession[]; total_sessions: number }>("/admin/eval/traces?limit=20"),
        get<{ actions: ActionExecutionRequest[] }>(
          statusFilter ? `/admin/eval/actions?status=${encodeURIComponent(statusFilter)}` : "/admin/eval/actions"
        ),
      ]);
      setSummary(sum);
      setSessions(traceData.sessions || []);
      setActions(actionData.actions || []);
    } catch {
      toast.error("Failed to load eval dashboard data");
    } finally {
      setIsLoading(false);
    }
  }, [hours, statusFilter]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const executeAction = async (id: string) => {
    setBusyActionId(id);
    try {
      await post(`/admin/eval/actions/${id}/execute`, {});
      toast.success("Action executed");
      await loadAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setBusyActionId(null);
    }
  };

  const createActionRequest = async () => {
    const idempotencyKey = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let payloadObj: Record<string, unknown> = {};
    try {
      payloadObj = JSON.parse(newPayload || "{}");
    } catch {
      toast.error("Payload must be valid JSON");
      return;
    }

    try {
      await post("/admin/eval/actions/request", {
        idempotency_key: idempotencyKey,
        action_type: newActionType,
        payload: payloadObj,
        requires_approval: requiresApproval,
      });
      toast.success("Action request created");
      await loadAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Create action failed");
    }
  };

  const approveAction = async (id: string) => {
    setBusyActionId(id);
    try {
      await post(`/admin/eval/actions/${id}/approve`, { execute_after_approval: true });
      toast.success("Action approved");
      await loadAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setBusyActionId(null);
    }
  };

  const rejectAction = async (id: string) => {
    setBusyActionId(id);
    try {
      await post(`/admin/eval/actions/${id}/reject`, { reason: "Rejected by admin" });
      toast.success("Action rejected");
      await loadAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setBusyActionId(null);
    }
  };

  const topPhases = useMemo(() => summary?.events_by_phase?.slice(0, 6) || [], [summary]);
  const topModels = useMemo(() => summary?.events_by_model?.slice(0, 6) || [], [summary]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-900 text-sm"
        >
          <option value={6}>Last 6h</option>
          <option value={24}>Last 24h</option>
          <option value={72}>Last 72h</option>
          <option value={168}>Last 7d</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-900 text-sm"
        >
          <option value="">All actions</option>
          <option value="pending_approval">Pending approval</option>
          <option value="approved">Approved</option>
          <option value="executed">Executed</option>
          <option value="rejected">Rejected</option>
          <option value="failed">Failed</option>
        </select>
        <button onClick={loadAll} className="btn-ghost flex items-center gap-1.5 text-sm">
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card p-3"><p className="text-xs text-surface-500">Requests</p><p className="text-lg font-semibold">{summary.unique_requests}</p></div>
          <div className="card p-3"><p className="text-xs text-surface-500">Avg Latency</p><p className="text-lg font-semibold">{summary.avg_latency_ms ? `${Math.round(summary.avg_latency_ms)} ms` : "-"}</p></div>
          <div className="card p-3"><p className="text-xs text-surface-500">Quality Flags</p><p className="text-lg font-semibold">{summary.quality_issue_events}</p></div>
          <div className="card p-3"><p className="text-xs text-surface-500">Action Retries</p><p className="text-lg font-semibold">{summary.retry_count}</p></div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Activity size={14}/>Top Phases</h3>
          <div className="space-y-2">
            {topPhases.map((p) => (
              <div key={p.phase} className="flex items-center justify-between text-sm">
                <span className="text-surface-600 dark:text-surface-300">{p.phase}</span>
                <span className="font-medium">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Clock size={14}/>Top Models</h3>
          <div className="space-y-2">
            {topModels.map((m) => (
              <div key={m.model} className="flex items-center justify-between text-sm">
                <span className="text-surface-600 dark:text-surface-300">{m.model}</span>
                <span className="font-medium">{m.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="text-sm font-semibold mb-3">Request Trace Timeline</h3>
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {sessions.length === 0 && <p className="text-sm text-surface-500">No traces yet.</p>}
          {sessions.map((s) => (
            <details key={s.request_id} className="border rounded-lg border-surface-200 dark:border-surface-700 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {s.request_id} • {s.events.length} events
              </summary>
              <div className="mt-3 space-y-2">
                {s.events.map((e) => (
                  <div key={e.id} className="text-xs border-l-2 border-primary-300 pl-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{e.phase}</span>
                      {e.model && <span className="text-surface-500">model: {e.model}</span>}
                      {typeof e.latency_ms === "number" && <span className="text-surface-500">latency: {e.latency_ms}ms</span>}
                    </div>
                    <div className="text-surface-400">{formatTime(e.created_at)}</div>
                    {e.metadata && Object.keys(e.metadata).length > 0 && (
                      <pre className="mt-1 bg-surface-50 dark:bg-surface-800 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(e.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><ShieldCheck size={14}/>Approval-Gated Actions</h3>
        <div className="mb-4 border rounded-lg border-surface-200 dark:border-surface-700 p-3">
          <p className="text-xs text-surface-500 mb-2">Create action request</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              value={newActionType}
              onChange={(e) => setNewActionType(e.target.value)}
              className="px-2.5 py-2 text-sm rounded border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-900"
              placeholder="action_type e.g. write.update_policy"
            />
            <label className="flex items-center gap-2 text-xs text-surface-600 dark:text-surface-300">
              <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} />
              Requires approval
            </label>
            <button onClick={createActionRequest} className="text-sm px-3 py-2 rounded bg-primary-600 text-white hover:bg-primary-700">Create Request</button>
          </div>
          <textarea
            value={newPayload}
            onChange={(e) => setNewPayload(e.target.value)}
            rows={3}
            className="mt-2 w-full px-2.5 py-2 text-xs rounded border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-900 font-mono"
          />
        </div>
        <div className="space-y-3">
          {actions.length === 0 && <p className="text-sm text-surface-500">No action requests.</p>}
          {actions.map((a) => (
            <div key={a.id} className="border rounded-lg border-surface-200 dark:border-surface-700 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{a.action_type}</p>
                  <p className="text-xs text-surface-500">idempotency: {a.idempotency_key}</p>
                  <p className="text-xs text-surface-400">created: {formatTime(a.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-1 rounded bg-surface-100 dark:bg-surface-800">{a.status}</span>
                  {a.status === "pending_approval" && (
                    <>
                      <button onClick={() => approveAction(a.id)} disabled={busyActionId === a.id} className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 flex items-center gap-1">
                        <CheckCircle2 size={12}/>Approve
                      </button>
                      <button onClick={() => rejectAction(a.id)} disabled={busyActionId === a.id} className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 flex items-center gap-1">
                        <XCircle size={12}/>Reject
                      </button>
                    </>
                  )}
                  {a.status === "approved" && (
                    <button onClick={() => executeAction(a.id)} disabled={busyActionId === a.id} className="text-xs px-2 py-1 rounded bg-primary-600 text-white hover:bg-primary-700 flex items-center gap-1">
                      <PlayCircle size={12}/>Execute
                    </button>
                  )}
                  {a.status === "failed" && (
                    <span className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1"><AlertTriangle size={12}/>Failed</span>
                  )}
                </div>
              </div>
              <details className="mt-2">
                <summary className="text-xs cursor-pointer text-surface-500">Payload / Result</summary>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-xs">
                  <pre className="bg-surface-50 dark:bg-surface-800 rounded p-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(a.payload, null, 2)}</pre>
                  <pre className="bg-surface-50 dark:bg-surface-800 rounded p-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(a.result, null, 2)}</pre>
                </div>
                {a.error_message && <p className="text-xs text-red-500 mt-2">{a.error_message}</p>}
              </details>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
