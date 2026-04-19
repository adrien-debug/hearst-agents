"use client";

import { useState, useCallback } from "react";
import type { RightPanelMission, RightPanelRun, RightPanelAsset } from "@/lib/ui/right-panel/types";
import { formatMissionSchedule } from "@/lib/runtime/missions/format";

function formatDate(ts?: number): string | null {
  if (!ts) return null;
  return new Date(ts).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MissionDetailSection({
  mission,
  linkedRuns,
  linkedAssets,
  onClose,
  onRunSelect,
  onAssetSelect,
  onToggleEnabled,
  onRefresh,
}: {
  mission: RightPanelMission;
  linkedRuns: RightPanelRun[];
  linkedAssets: RightPanelAsset[];
  onClose: () => void;
  onRunSelect?: (runId: string) => void;
  onAssetSelect?: (assetId: string) => void;
  onToggleEnabled?: (id: string, enabled: boolean) => void;
  onRefresh?: () => void;
}) {
  const [runningNow, setRunningNow] = useState(false);
  const [toggling, setToggling] = useState(false);

  const handleRunNow = useCallback(async () => {
    setRunningNow(true);
    try {
      const res = await fetch(`/api/v2/missions/${mission.id}/run`, {
        method: "POST",
      });
      if (res.ok) {
        console.log("[MissionDetail] Run triggered");
        onRefresh?.();
      }
    } catch (err) {
      console.error("[MissionDetail] Run now failed:", err);
    } finally {
      setRunningNow(false);
    }
  }, [mission.id, onRefresh]);

  const handleToggle = useCallback(async () => {
    setToggling(true);
    const newEnabled = !mission.enabled;
    try {
      const res = await fetch("/api/v2/missions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mission.id, enabled: newEnabled }),
      });
      if (res.ok) {
        onToggleEnabled?.(mission.id, newEnabled);
        onRefresh?.();
      }
    } catch (err) {
      console.error("[MissionDetail] Toggle failed:", err);
    } finally {
      setToggling(false);
    }
  }, [mission.id, mission.enabled, onToggleEnabled, onRefresh]);

  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Mission Detail
        </h3>
        <button
          onClick={onClose}
          className="text-[10px] text-zinc-600 transition-colors hover:text-zinc-400"
        >
          Close
        </button>
      </div>

      <div className="rounded-lg bg-zinc-900/50 px-2.5 py-2">
        {/* Header */}
        <p className="text-xs font-medium text-zinc-200">{mission.name}</p>
        <div className="mt-1 flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${mission.enabled ? "bg-emerald-500" : "bg-zinc-700"}`}
          />
          <span className="text-[10px] text-zinc-500">
            {mission.enabled ? "Active" : "Pausée"}
          </span>
          <span className="text-[10px] text-zinc-600">
            {formatMissionSchedule(mission.schedule)}
          </span>
        </div>

        {/* Prompt */}
        {mission.input && (
          <div className="mt-2 rounded-md bg-zinc-950/50 px-2 py-1.5">
            <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-600">Prompt</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-400">
              {mission.input.length > 200 ? mission.input.slice(0, 200) + "…" : mission.input}
            </p>
          </div>
        )}

        {/* Last run */}
        {mission.lastRunAt && (
          <p className="mt-2 text-[10px] text-zinc-600">
            Dernière exécution : {formatDate(mission.lastRunAt)}
          </p>
        )}

        {/* Actions */}
        <div className="mt-2.5 flex items-center gap-2">
          <button
            onClick={handleRunNow}
            disabled={runningNow}
            className="rounded-md bg-cyan-500/10 px-2.5 py-1 text-[10px] font-medium text-cyan-400 transition-colors hover:bg-cyan-500/20 disabled:opacity-50"
          >
            {runningNow ? "Exécution…" : "Exécuter maintenant"}
          </button>
          <button
            onClick={handleToggle}
            disabled={toggling}
            className="rounded-md bg-zinc-800/40 px-2.5 py-1 text-[10px] text-zinc-400 transition-colors hover:bg-zinc-800/60 disabled:opacity-50"
          >
            {toggling ? "…" : mission.enabled ? "Désactiver" : "Activer"}
          </button>
        </div>
      </div>

      {/* Linked runs */}
      {linkedRuns.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-[9px] font-medium uppercase tracking-wider text-zinc-600">
            Exécutions récentes
          </p>
          <div className="space-y-0.5">
            {linkedRuns.slice(0, 5).map((run) => (
              <button
                key={run.id}
                onClick={() => onRunSelect?.(run.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-zinc-900/40"
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    run.status === "completed"
                      ? "bg-emerald-500"
                      : run.status === "failed"
                        ? "bg-red-500"
                        : "bg-amber-500"
                  }`}
                />
                <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-400">
                  {run.input.slice(0, 60)}
                </span>
                {run.createdAt && (
                  <span className="shrink-0 text-[9px] text-zinc-600">
                    {formatDate(run.createdAt)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Linked assets */}
      {linkedAssets.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-[9px] font-medium uppercase tracking-wider text-zinc-600">
            Derniers assets
          </p>
          <div className="space-y-0.5">
            {linkedAssets.slice(0, 5).map((asset) => (
              <button
                key={asset.id}
                onClick={() => onAssetSelect?.(asset.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-zinc-900/40"
              >
                <span className="text-[10px] text-zinc-400">{asset.name}</span>
                <span className="text-[9px] text-zinc-600">{asset.type}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
