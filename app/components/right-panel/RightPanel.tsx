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
import type { FocalObject, FocalAction } from "@/lib/right-panel/objects";
import type { RightPanelRun, RightPanelMission } from "@/lib/ui/right-panel/types";
import { FocalObjectRenderer, TYPE_LABELS } from "./FocalObjectRenderer";
import { FocalOverlay } from "./FocalOverlay";
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

  const [overlayObject, setOverlayObject] = useState<FocalObject | null>(null);

  // ── Legacy state (only used when no focal object) ──────────
  const [selectedRun, setSelectedRun] = useState<SelectedRun | null>(null);
  const [connectorsOpen, setConnectorsOpen] = useState(false);

  const surfaceCtx = useSurfaceOptional();

  useEffect(() => {
    let mounted = true;
    if (!surfaceCtx) return;
    if (surfaceCtx.isConnectionInterrupted) {
      if (mounted) setConnectorsOpen(true);
    }
    return () => { mounted = false; };
  }, [surfaceCtx]);

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
    <>
      <aside className="hidden h-full w-[380px] shrink-0 flex-col bg-white/2 backdrop-blur-3xl xl:flex relative overflow-hidden">
        {/* Status indicator */}
        <div className="flex h-12 items-center px-6 shrink-0 z-20">
          <span
            className={`ml-auto h-[5px] w-[5px] rounded-full transition-colors duration-500 ${
              connected ? "bg-emerald-400/80" : "bg-white/10"
            }`}
          />
        </div>

        {/* Content area — NO SCROLL */}
        <div className="flex-1 overflow-hidden px-6 flex flex-col min-h-0">

          {/* ── Focal Object Layer (primary, masked) ── */}
          {isFocused && focal && (
            <div
              className="group max-h-[25%] overflow-hidden cursor-pointer shrink-0 transition-all duration-300 ease-out hover:-translate-y-px hover:shadow-[0_4px_20px_rgba(34,211,238,0.03)]"
              style={{
                maskImage: "linear-gradient(to bottom, black 80%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, black 80%, transparent 100%)",
              }}
              onClick={() => setOverlayObject(focal)}
            >
              <FocalObjectRenderer object={focal} onAction={handleFocalAction} mode="preview" />
            </div>
          )}

          {/* ── Silent divider ── */}
          {isFocused && secondary.length > 0 && (
            <div className="border-t border-white/[0.02] my-4" />
          )}

          {/* ── Secondary Objects (Timeline Register) ── */}
          {secondary.length > 0 && (
            <div className="space-y-1 shrink-0 overflow-hidden">
              {secondary.map((obj) => {
                const ts = (obj as Record<string, unknown>).createdAt as number | undefined;
                const timeStr = ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
                
                return (
                  <button
                    key={obj.id}
                    className="w-full group text-left"
                    onClick={() => setOverlayObject(obj)}
                  >
                    <div className="flex justify-between items-center h-10 px-2 rounded-md transition-colors">
                      <span className="text-[13px] text-zinc-300 group-hover:text-zinc-100 transition-colors truncate pr-4">
                        {obj.title || TYPE_LABELS[obj.objectType] || obj.objectType}
                      </span>
                      <span className="text-[11px] text-zinc-600 font-mono shrink-0 group-hover:text-cyan-400 transition-colors">
                        {timeStr}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Legacy fallback (only when no focal object) ── */}
          {!isFocused && (
            <div className="space-y-6 overflow-hidden">
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

              {effectiveConnectorsOpen && (
                <div className="mt-4">
                  <ConnectorsSection />
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {overlayObject && (
        <FocalOverlay
          object={overlayObject}
          onClose={() => setOverlayObject(null)}
          onAction={handleFocalAction}
          allObjects={focal ? [focal, ...secondary] : secondary}
          onNavigate={setOverlayObject}
        />
      )}
    </>
  );
}
