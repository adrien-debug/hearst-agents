"use client";

import { useState, useEffect, useCallback } from "react";

interface Mission {
  id: string;
  missionId?: string;
  name: string;
  status: "idle" | "running" | "success" | "failed" | "blocked";
  enabled: boolean;
  lastRunAt?: number;
  lastRunStatus?: string;
  lastError?: string;
  runningSince?: number;
  lastRunId?: string;
}

interface SchedulerState {
  instanceId: string;
  mode: "leader" | "standby" | "local_fallback";
  isLeader: boolean;
  leaderInstanceId?: string;
  leadershipExpiresAt?: string;
}

const MODE_CHIP: Record<string, { label: string; cls: string }> = {
  leader: { label: "Leader", cls: "bg-[var(--money)]/15 text-[var(--money)] border-[var(--money)]/30" },
  standby: { label: "Standby", cls: "bg-[var(--text-muted)]/15 text-[var(--text-muted)] border-[var(--line-strong)]" },
  local_fallback: { label: "Local Fallback", cls: "bg-[var(--warn)]/15 text-[var(--warn)] border-[var(--warn)]/30" },
};

const STATUS_STYLE: Record<string, { dot: string; label: string }> = {
  idle: { dot: "bg-[var(--text-muted)]", label: "Idle" },
  running: { dot: "bg-[var(--cykan)] animate-pulse", label: "Running" },
  success: { dot: "bg-[var(--money)]", label: "Success" },
  failed: { dot: "bg-[var(--danger)]", label: "Failed" },
  blocked: { dot: "bg-[var(--warn)]", label: "Blocked" },
};

function formatTime(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(since?: number): string {
  if (!since) return "";
  const s = Math.floor((Date.now() - since) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function SchedulerAdminPage() {
  const [scheduler, setScheduler] = useState<SchedulerState | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [schedRes, missionsRes] = await Promise.all([
        fetch("/api/v2/scheduler/status"),
        fetch("/api/v2/missions"),
      ]);
      if (!schedRes.ok || !missionsRes.ok) throw new Error("Failed");
      const schedData = await schedRes.json();
      const missionsData = await missionsRes.json();
      setScheduler(schedData.scheduler || null);
      setMissions(missionsData.missions || []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const load = () => refresh();
    load();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  const runningMissions = missions.filter((m) => m.status === "running");
  const failedOrBlocked = missions
    .filter((m) => m.lastRunStatus === "failed" || m.lastRunStatus === "blocked")
    .slice(0, 10);

  async function handleRunNow(missionId: string) {
    setActionLoading(missionId);
    try {
      await fetch(`/api/v2/missions/${missionId}/run`, { method: "POST" });
      setTimeout(refresh, 1500);
    } catch { /* logged server-side */ }
    setActionLoading(null);
  }

  async function handleToggle(missionId: string, enabled: boolean) {
    setActionLoading(missionId);
    try {
      await fetch("/api/v2/missions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: missionId, enabled }),
      });
      refresh();
    } catch { /* logged server-side */ }
    setActionLoading(null);
  }

  if (loading) {
    return (
      <div className="px-8 py-10">
        <div className="h-6 w-32 animate-pulse rounded bg-[var(--bg-soft)]" />
        <div className="mt-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-[var(--bg-soft)]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-10">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.35em] text-[var(--text-muted)]">Hearst</p>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Scheduler</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Leadership, mission execution, and operational status</p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          Failed to load scheduler data
        </div>
      )}

      {scheduler && (
        <div className="mb-8 rounded-sm border border-[var(--line)] bg-[var(--bg-soft)] p-5">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Scheduler Status</h2>
            <span className={`inline-flex items-center rounded border px-2 py-0.5 t-10 font-medium ${MODE_CHIP[scheduler.mode]?.cls ?? MODE_CHIP.standby.cls}`}>
              {MODE_CHIP[scheduler.mode]?.label ?? scheduler.mode}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="t-10 uppercase text-[var(--text-muted)]">Instance</p>
              <p className="mt-0.5 truncate font-mono text-xs text-[var(--text-soft)]">{scheduler.instanceId}</p>
            </div>
            <div>
              <p className="t-10 uppercase text-[var(--text-muted)]">Leader</p>
              <p className="mt-0.5 truncate font-mono text-xs text-[var(--text-soft)]">{scheduler.leaderInstanceId ?? "—"}</p>
            </div>
            <div>
              <p className="t-10 uppercase text-[var(--text-muted)]">Lease Expiry</p>
              <p className="mt-0.5 text-xs text-[var(--text-soft)]">
                {scheduler.leadershipExpiresAt ? new Date(scheduler.leadershipExpiresAt).toLocaleTimeString("fr-FR") : "—"}
              </p>
            </div>
            <div>
              <p className="t-10 uppercase text-[var(--text-muted)]">Is Leader</p>
              <p className="mt-0.5 text-xs text-[var(--text-soft)]">{scheduler.isLeader ? "Yes" : "No"}</p>
            </div>
          </div>
        </div>
      )}

      {runningMissions.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--cykan)]">
            Running Now<span className="ml-2 text-[var(--text-muted)]">{runningMissions.length}</span>
          </h2>
          <div className="space-y-2">
            {runningMissions.map((m) => (
              <div key={m.missionId || m.id} className="flex items-center gap-3 rounded-lg border border-[var(--cykan)]/20 bg-[var(--cykan)]/8 px-4 py-3">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--cykan)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[var(--text)]">{m.name}</p>
                  <p className="t-10 text-[var(--text-muted)]">
                    Running for {formatDuration(m.runningSince)}
                    {m.lastRunId && <span className="ml-2 font-mono text-[var(--text-muted)]">{m.lastRunId.slice(0, 8)}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {failedOrBlocked.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--danger)]">
            Recent Issues<span className="ml-2 text-[var(--text-muted)]">{failedOrBlocked.length}</span>
          </h2>
          <div className="space-y-1.5">
            {failedOrBlocked.map((m) => {
              const s = STATUS_STYLE[m.lastRunStatus ?? "failed"];
              return (
                <div key={m.missionId || m.id} className="flex items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--bg-elev)] px-4 py-2.5">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-[var(--text-soft)]">{m.name}</p>
                    {m.lastError && <p className="mt-0.5 truncate t-10 text-[var(--danger)]/70">{m.lastError.length > 100 ? m.lastError.slice(0, 100) + "…" : m.lastError}</p>}
                  </div>
                  <span className="shrink-0 t-10 text-[var(--text-muted)]">{formatTime(m.lastRunAt)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            All Missions<span className="ml-2 text-[var(--text-muted)]">{missions.length}</span>
          </h2>
          <button onClick={refresh} className="t-10 text-[var(--text-muted)] transition-colors hover:text-[var(--text-soft)]">Refresh</button>
        </div>

        {missions.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No scheduled missions</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--line)] t-10 uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="px-4 py-2.5">Mission</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Enabled</th>
                  <th className="px-3 py-2.5">Last Run</th>
                  <th className="px-3 py-2.5">Result</th>
                  <th className="px-3 py-2.5">Error</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {missions.map((m) => {
                  const s = STATUS_STYLE[m.status] ?? STATUS_STYLE.idle;
                  const isLoading = actionLoading === (m.missionId || m.id);
                  return (
                    <tr key={m.missionId || m.id} className="hover:bg-[var(--bg-elev)]">
                      <td className="max-w-[200px] truncate px-4 py-2.5 text-[var(--text-soft)]">{m.name}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                          <span className="text-[var(--text-muted)]">{s.label}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><span className={m.enabled ? "text-[var(--money)]" : "text-[var(--text-muted)]"}>{m.enabled ? "On" : "Off"}</span></td>
                      <td className="px-3 py-2.5 text-[var(--text-muted)]">{formatTime(m.lastRunAt)}</td>
                      <td className="px-3 py-2.5">
                        {m.lastRunStatus && (
                          <span className={m.lastRunStatus === "success" ? "text-[var(--money)]" : m.lastRunStatus === "blocked" ? "text-[var(--warn)]" : "text-[var(--danger)]"}>
                            {m.lastRunStatus}
                          </span>
                        )}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2.5 text-[var(--danger)]/60">{m.lastError ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleRunNow(m.missionId || m.id)} disabled={isLoading} className="rounded border border-[var(--line-strong)] px-2 py-1 t-10 text-[var(--text-muted)] transition-colors hover:border-[var(--cykan)]/40 hover:text-[var(--cykan)] disabled:opacity-40">Run</button>
                          <button onClick={() => handleToggle(m.missionId || m.id, !m.enabled)} disabled={isLoading} className="rounded border border-[var(--line-strong)] px-2 py-1 t-10 text-[var(--text-muted)] transition-colors hover:border-[var(--cykan)] hover:text-[var(--text-soft)] disabled:opacity-40">{m.enabled ? "Disable" : "Enable"}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
