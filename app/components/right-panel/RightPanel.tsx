"use client";

/**
 * Right Panel — Unified focal-object rendering surface.
 *
 * Invariants:
 * - NO tabs
 * - NO lists
 * - NO generic cards
 * - NO dashboard stacks
 * - NO admin chrome
 * - One focal object at a time
 * - Max 2 secondary objects (softened)
 * - Legacy sections kept as fallback ONLY when no focal object exists
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRightPanel } from "@/app/hooks/use-right-panel";
import { useRunStreamOptional } from "@/app/lib/run-stream-context";
import { useSurfaceOptional } from "@/app/hooks/use-surface";
import { useFocalObject } from "@/app/hooks/use-focal-object";
import type { FocalAction } from "@/lib/right-panel/objects";
import type { RightPanelRun, RightPanelMission } from "@/lib/ui/right-panel/types";
import { FocalObjectRenderer } from "./FocalObjectRenderer";
import { ActivitySection } from "./ActivitySection";
import { MissionsSection } from "./MissionsSection";
import { ConnectorsSection } from "./ConnectorsSection";
import { RunTimelineSection, type SelectedRun } from "./RunTimelineSection";

export default function RightPanel() {
  const { data, loading, error, refresh } = useRightPanel();
  const stream = useRunStreamOptional();
  const connected = stream?.connected ?? false;
  const liveEvents = useMemo(() => stream?.liveEvents ?? [], [stream?.liveEvents]);
  const { focal, secondary, isFocused } = useFocalObject();

  // ── Legacy state (only used when no focal object) ──────────
  const [selectedRun, setSelectedRun] = useState<SelectedRun | null>(null);
  const [connectorsOpen, setConnectorsOpen] = useState(false);

  const surfaceCtx = useSurfaceOptional();

  useEffect(() => {
    if (!surfaceCtx) return;
    if (surfaceCtx.isConnectionInterrupted) {
      setConnectorsOpen(true);
    }
  }, [surfaceCtx?.isConnectionInterrupted]);

  const hasBlocked = useMemo(
    () => liveEvents.some((e) => e.type === "capability_blocked"),
    [liveEvents],
  );
  const effectiveConnectorsOpen = connectorsOpen || hasBlocked;

  const handleRunSelect = useCallback(
    (run: RightPanelRun) => {
      if (selectedRun?.id === run.id) {
        setSelectedRun(null);
        return;
      }
      setSelectedRun({
        id: run.id,
        input: run.input,
        status: run.status,
        executionMode: run.executionMode,
        agentId: run.agentId,
      });
    },
    [selectedRun],
  );

  const handleFocalAction = useCallback((action: FocalAction) => {
    // Focal actions are dispatched to surface state / planner
    // TODO: wire to approvePlan / pauseMission / etc.
    console.log("[RightPanel] focal action:", action.kind);
  }, []);

  return (
    <aside className="hidden h-full w-[380px] shrink-0 flex-col bg-white/2 backdrop-blur-3xl xl:flex relative">
      {/* Status indicator */}
      <div className="flex h-12 items-center px-6 shrink-0 z-20">
        <span
          className={`ml-auto h-[5px] w-[5px] rounded-full transition-colors duration-500 ${
            connected ? "bg-emerald-400/80" : "bg-white/10"
          }`}
        />
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-6">

        {/* ── Focal Object Layer (primary) ── */}
        {isFocused && focal && (
          <FocalObjectRenderer object={focal} onAction={handleFocalAction} />
        )}

        {/* ── Secondary Objects (softened) ── */}
        {secondary.length > 0 && (
          <div className="mt-8 space-y-6 opacity-40">
            {secondary.map((obj) => (
              <FocalObjectRenderer key={obj.id} object={obj} />
            ))}
          </div>
        )}

        {/* ── Legacy fallback (only when no focal object) ── */}
        {!isFocused && (
          <div className="space-y-6">
            {/* Run timeline if selected */}
            {selectedRun ? (
              <RunTimelineSection
                selectedRun={selectedRun}
                onDeselect={() => setSelectedRun(null)}
                onAssetSelect={() => {}}
              />
            ) : (
              <ActivitySection
                currentRun={data.currentRun}
                runs={data.recentRuns}
                liveEvents={liveEvents}
                loading={loading}
                error={error}
                selectedRunId={undefined}
                onRunSelect={handleRunSelect}
              />
            )}

            {/* Connectors — only on blocked capability */}
            {effectiveConnectorsOpen && (
              <div className="mt-4">
                <ConnectorsSection />
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
