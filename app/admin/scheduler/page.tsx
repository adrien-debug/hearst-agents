"use client";

import { useSchedulerAdmin } from "@/app/hooks/use-scheduler-admin";
import { useState } from "react";

const MODE_CHIP: Record<string, { label: string; cls: string }> = {
  leader: { label: "Leader", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  standby: { label: "Standby", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  local_fallback: { label: "Local Fallback", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

const STATUS_STYLE: Record<string, { dot: string; label: string }> = {
  idle: { dot: "bg-zinc-600", label: "Idle" },
  running: { dot: "bg-cyan-400 animate-pulse", label: "Running" },
  success: { dot: "bg-emerald-500", label: "Success" },
  failed: { dot: "bg-red-500", label: "Failed" },
  blocked: { dot: "bg-amber-500", label: "Blocked" },
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
  const { loading, error, scheduler, missions, refresh } = useSchedulerAdmin();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
        <div className="h-6 w-32 animate-pulse rounded bg-zinc-800" />
        <div className="mt-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-zinc-900/40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.35em] text-zinc-500">Hearst</p>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Scheduler</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Leadership, mission execution, and operational status
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          Failed to load scheduler data
        </div>
      )}

      {/* Scheduler status card */}
      {scheduler && (
        <div className="mb-8 rounded-xl border border-zinc-800/50 bg-zinc-900/40 p-5">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Scheduler Status
            </h2>
            <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-medium ${MODE_CHIP[scheduler.mode]?.cls ?? MODE_CHIP.standby.cls}`}>
              {MODE_CHIP[scheduler.mode]?.label ?? scheduler.mode}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase text-zinc-600">Instance</p>
              <p className="mt-0.5 truncate font-mono text-xs text-zinc-300">{scheduler.instanceId}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-zinc-600">Leader</p>
              <p className="mt-0.5 truncate font-mono text-xs text-zinc-300">
                {scheduler.leaderInstanceId ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-zinc-600">Lease Expiry</p>
              <p className="mt-0.5 text-xs text-zinc-300">
                {scheduler.leadershipExpiresAt
                  ? new Date(scheduler.leadershipExpiresAt).toLocaleTimeString("fr-FR")
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-zinc-600">Is Leader</p>
              <p className="mt-0.5 text-xs text-zinc-300">{scheduler.isLeader ? "Yes" : "No"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Running missions */}
      {runningMissions.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-400">
            Running Now
            <span className="ml-2 text-zinc-600">{runningMissions.length}</span>
          </h2>
          <div className="space-y-2">
            {runningMissions.map((m) => (
              <div key={m.missionId} className="flex items-center gap-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
                <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-200">{m.name}</p>
                  <p className="text-[10px] text-zinc-500">
                    Running for {formatDuration(m.runningSince)}
                    {m.lastRunId && <span className="ml-2 font-mono text-zinc-600">{m.lastRunId.slice(0, 8)}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent failed / blocked */}
      {failedOrBlocked.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-red-400">
            Recent Issues
            <span className="ml-2 text-zinc-600">{failedOrBlocked.length}</span>
          </h2>
          <div className="space-y-1.5">
            {failedOrBlocked.map((m) => {
              const s = STATUS_STYLE[m.lastRunStatus ?? "failed"];
              return (
                <div key={m.missionId} className="flex items-start gap-3 rounded-lg border border-zinc-800/40 bg-zinc-900/30 px-4 py-2.5">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-zinc-300">{m.name}</p>
                    {m.lastError && (
                      <p className="mt-0.5 truncate text-[10px] text-red-400/60">
                        {m.lastError.length > 100 ? m.lastError.slice(0, 100) + "…" : m.lastError}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] text-zinc-600">{formatTime(m.lastRunAt)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All missions table */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            All Missions
            <span className="ml-2 text-zinc-600">{missions.length}</span>
          </h2>
          <button
            onClick={refresh}
            className="text-[10px] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Refresh
          </button>
        </div>

        {missions.length === 0 ? (
          <p className="text-sm text-zinc-600">No scheduled missions</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800/40">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800/30 text-[10px] uppercase tracking-wider text-zinc-600">
                  <th className="px-4 py-2.5">Mission</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Enabled</th>
                  <th className="px-3 py-2.5">Last Run</th>
                  <th className="px-3 py-2.5">Result</th>
                  <th className="px-3 py-2.5">Error</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/20">
                {missions.map((m) => {
                  const s = STATUS_STYLE[m.status] ?? STATUS_STYLE.idle;
                  const isLoading = actionLoading === m.missionId;
                  return (
                    <tr key={m.missionId} className="hover:bg-zinc-900/30">
                      <td className="max-w-[200px] truncate px-4 py-2.5 text-zinc-300">
                        {m.name}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                          <span className="text-zinc-400">{s.label}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={m.enabled ? "text-emerald-400" : "text-zinc-600"}>
                          {m.enabled ? "On" : "Off"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-zinc-500">{formatTime(m.lastRunAt)}</td>
                      <td className="px-3 py-2.5">
                        {m.lastRunStatus && (
                          <span className={
                            m.lastRunStatus === "success" ? "text-emerald-400" :
                            m.lastRunStatus === "blocked" ? "text-amber-400" :
                            "text-red-400"
                          }>
                            {m.lastRunStatus}
                          </span>
                        )}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2.5 text-red-400/50">
                        {m.lastError ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleRunNow(m.missionId || m.id)}
                            disabled={isLoading}
                            className="rounded border border-zinc-700/50 px-2 py-1 text-[10px] text-zinc-400 transition-colors hover:border-cyan-500/30 hover:text-cyan-400 disabled:opacity-40"
                          >
                            Run
                          </button>
                          <button
                            onClick={() => handleToggle(m.missionId || m.id, !m.enabled)}
                            disabled={isLoading}
                            className="rounded border border-zinc-700/50 px-2 py-1 text-[10px] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-300 disabled:opacity-40"
                          >
                            {m.enabled ? "Disable" : "Enable"}
                          </button>
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
