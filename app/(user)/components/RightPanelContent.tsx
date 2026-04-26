"use client";

/**
 * RightPanelContent — Panel internals (extracted for responsive wrapper)
 *
 * Separated from RightPanel.tsx to avoid "components during render" error.
 * This component contains all the logic and UI of the right panel.
 */

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import type { RightPanelData, FocalObjectView } from "@/lib/core/types";
import { mapFocalObject, mapFocalObjects } from "@/lib/core/types/focal";
import { useFocalStore } from "@/stores/focal";
import { useNavigationStore } from "@/stores/navigation";
import { useRuntimeStore } from "@/stores/runtime";
import { FocalRetryButton } from "./FocalRetryButton";

interface RightPanelContentProps {
  /** Called when user requests panel close (mobile drawer) */
  onClose?: () => void;
}

export function RightPanelContent({ onClose }: RightPanelContentProps) {
  const coreState = useRuntimeStore((s) => s.coreState);
  const currentRunId = useRuntimeStore((s) => s.currentRunId);
  const flowLabel = useRuntimeStore((s) => s.flowLabel);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const { data: session } = useSession();

  const [data, setData] = useState<RightPanelData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeThreadIdRef = useRef(activeThreadId);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  /** Live updates via SSE (~1s), same contract as GET /api/v2/right-panel */
  useEffect(() => {
    if (!activeThreadId) {
      // Use microtask to avoid synchronous setState in effect
      Promise.resolve().then(() => {
        setData(null);
        setLoading(false);
        setIsConnected(false);
      });
      return;
    }

    const streamThreadId = activeThreadId;
    let cancelled = false;
    
    Promise.resolve().then(() => {
      if (!cancelled) setLoading(true);
    });

    const url = `/api/v2/right-panel/stream?thread_id=${encodeURIComponent(streamThreadId)}`;
    const es = new EventSource(url);

    const applyPanel = (panelData: RightPanelData) => {
      if (cancelled || activeThreadIdRef.current !== streamThreadId) return;
      setData(panelData);
      setIsConnected(true);
      const hydrateThreadState = useFocalStore.getState().hydrateThreadState;
      const tid = activeThreadIdRef.current;
      const mappedFocal = panelData.focalObject ? mapFocalObject(panelData.focalObject, tid) : null;
      const secondary = panelData.secondaryObjects
        ? mapFocalObjects(panelData.secondaryObjects as unknown[], tid).slice(0, 3)
        : [];
      hydrateThreadState(mappedFocal, secondary);
      setLoading(false);
    };

    es.addEventListener("panel", (ev: MessageEvent<string>) => {
      try {
        const panelData = JSON.parse(ev.data) as RightPanelData;
        applyPanel(panelData);
      } catch (e) {
        console.error("[RightPanelContent] SSE panel parse failed:", e);
      }
    });

    es.addEventListener("stream_error", () => {
      if (!cancelled) setIsConnected(false);
    });

    es.onerror = () => {
      if (cancelled) return;
      setIsConnected(false);
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, [activeThreadId]);

  const handlePrimaryAction = async () => {
    if (!data?.focalObject) return;
    const focalObject = data.focalObject as FocalObjectView;
    if (!focalObject.primaryAction) return;

    const kind = focalObject.primaryAction.kind;
    setActionLoading(true);
    setActionError(null);

    try {
      let res: Response;

      if (kind === "approve" && focalObject.sourcePlanId) {
        res = await fetch(`/api/v2/plans/${focalObject.sourcePlanId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: activeThreadId,
            userId: session?.user?.email ?? "anonymous",
            connectedProviders: [],
          }),
        });
      } else if (kind === "pause" && focalObject.missionId) {
        res = await fetch(`/api/v2/missions/${focalObject.missionId}/pause`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } else if (kind === "resume" && focalObject.missionId) {
        res = await fetch(`/api/v2/missions/${focalObject.missionId}/resume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } else {
        throw new Error("Unknown action kind");
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Action failed: ${res.status}`);
      }

      // Refresh after action
      if (activeThreadId) {
        const refreshRes = await fetch(`/api/v2/right-panel?thread_id=${encodeURIComponent(activeThreadId)}`);
        if (refreshRes.ok) {
          const panelData: RightPanelData = await refreshRes.json();
          setData(panelData);
        }
      }

      onClose?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const hasActiveThread = Boolean(activeThreadId);
  const panelData = hasActiveThread ? data : null;
  const isRunning = coreState !== "idle";
  const focalObject = panelData?.focalObject;
  const secondaryObjects = panelData?.secondaryObjects || [];

  const getFocalProp = (obj: unknown, key: string): string | undefined => {
    if (typeof obj !== "object" || obj === null) return undefined;
    const val = (obj as Record<string, unknown>)[key];
    return typeof val === "string" ? val : undefined;
  };

  const focalObjectType = focalObject ? getFocalProp(focalObject, "objectType") || "unknown" : "";
  const focalTitle = focalObject ? getFocalProp(focalObject, "title") || "Untitled" : "";
  const focalStatus = focalObject ? getFocalProp(focalObject, "status") || "" : "";

  return (
    <aside
      className="w-[280px] h-full flex flex-col z-10 bg-transparent"
    >
      {/* Header with close button for mobile */}
      {onClose && (
        <div className="p-6 flex items-center justify-between md:hidden">
          <p className="text-[13px] font-medium tracking-wide">Runtime</p>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/[0.05] transition-colors"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Runtime Status */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">Runtime</p>
          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-[var(--money)]" : "bg-[var(--danger)]"}`} />
        </div>
        {coreState === "awaiting_approval" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-[var(--warn)]" />
              <span className="text-[13px] font-bold text-[var(--warn)]">{flowLabel || "Validation requise"}</span>
            </div>
            <p className="text-[10px] font-mono text-[var(--text-faint)]">awaiting_approval</p>
            <div className="h-[2px] bg-[var(--line-strong)] overflow-hidden">
              <div className="h-full bg-[var(--warn)] w-full" />
            </div>
          </div>
        ) : coreState === "awaiting_clarification" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-violet-400" />
              <span className="text-[13px] font-bold text-violet-400">{flowLabel || "Précision requise"}</span>
            </div>
            <p className="text-[10px] font-mono text-[var(--text-faint)]">awaiting_clarification</p>
            <div className="h-[2px] bg-[var(--line-strong)] overflow-hidden">
              <div className="h-full bg-violet-400 w-full" />
            </div>
          </div>
        ) : isRunning ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-[var(--cykan)]" />
              <span className="text-[13px] font-bold text-[var(--cykan)]">{flowLabel || "En cours..."}</span>
            </div>
            <p className="text-[10px] font-mono text-[var(--text-faint)]">{coreState}</p>
            <div className="h-[2px] bg-[var(--line-strong)] overflow-hidden">
              <div className="h-full bg-[var(--cykan)]" style={{ width: "66%" }} />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[var(--text-muted)]">
            <div className="w-2 h-2 rounded-full bg-[var(--text-faint)]" />
            <span className="text-[13px] font-bold">Inactif</span>
          </div>
        )}
      </div>

      {/* Focal Object */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {focalObject ? (
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">Focal</p>
              <span className={`text-[10px] font-bold uppercase ${
                focalStatus === "ready" || focalStatus === "delivered" ? "text-[var(--money)]" :
                focalStatus === "awaiting_approval" ? "text-[var(--warn)]" :
                focalStatus === "active" ? "text-[var(--money)]" :
                focalStatus === "paused" ? "text-yellow-500" :
                focalStatus === "composing" || focalStatus === "delivering" ? "text-[var(--cykan)]" :
                focalStatus === "failed" ? "text-[var(--danger)]" :
                "text-[var(--text-muted)]"
              }`}>
                {focalStatus === "awaiting_approval" ? "validation" :
                 focalStatus === "active" ? "actif" :
                 focalStatus === "paused" ? "pause" :
                 focalStatus}
              </span>
            </div>
            <p className="text-[16px] font-bold text-[var(--text)] truncate mb-1">{focalTitle}</p>
            <p className="text-[11px] font-mono text-[var(--text-faint)] mb-4">{focalObjectType}</p>

            {actionError && (
              <p className="text-[11px] text-[var(--danger)] mb-3">{actionError}</p>
            )}

            {(focalObject as FocalObjectView)?.primaryAction && (
              (focalObject as FocalObjectView).primaryAction?.kind === "retry" ? (
                <FocalRetryButton
                  missionId={(focalObject as FocalObjectView).missionId}
                  sourcePlanId={(focalObject as FocalObjectView).sourcePlanId}
                  threadId={
                    getFocalProp(focalObject, "threadId") ?? activeThreadId ?? undefined
                  }
                  focalTitle={getFocalProp(focalObject, "title")}
                  focalObjectType={getFocalProp(focalObject, "objectType")}
                  focalStatus={getFocalProp(focalObject, "status")}
                  label={(focalObject as FocalObjectView).primaryAction?.label}
                  onSuccess={() => {
                    if (activeThreadId) {
                      void fetch(
                        `/api/v2/right-panel?thread_id=${encodeURIComponent(activeThreadId)}`,
                        { credentials: "include" },
                      )
                        .then((res) => {
                          if (!res.ok) {
                            console.warn("[RightPanelContent] post-retry refresh failed:", res.status);
                            return null;
                          }
                          return res.json();
                        })
                        .then((panelData) => {
                          if (panelData) setData(panelData as RightPanelData);
                        })
                        .catch((e) => {
                          console.error("[RightPanelContent] post-retry refresh error:", e);
                        });
                    }
                    onClose?.();
                  }}
                  compact
                  className="w-full py-2 rounded-[4px] text-[12px] font-bold uppercase transition-all duration-150 bg-[var(--cykan)] text-black"
                />
              ) : (
                <button
                  className={`w-full py-2 rounded-[4px] text-[12px] font-bold uppercase transition-all duration-150 ${
                    (focalObject as FocalObjectView).primaryAction?.kind === "approve"
                      ? "bg-[var(--warn)] text-black hover:bg-[var(--warn)]/80"
                      : (focalObject as FocalObjectView).primaryAction?.kind === "pause"
                      ? "bg-yellow-500 text-black hover:bg-yellow-500/80"
                      : (focalObject as FocalObjectView).primaryAction?.kind === "resume"
                      ? "bg-[var(--money)] text-black hover:bg-[var(--money)]/80"
                      : "bg-[var(--cykan)] text-black hover:bg-[var(--cykan)]/80"
                  }`}
                  onClick={handlePrimaryAction}
                  disabled={actionLoading}
                >
                  {actionLoading ? "…" : (focalObject as FocalObjectView).primaryAction?.label}
                </button>
              )
            )}
          </div>
        ) : loading ? (
          <div className="px-6 py-4">
            <div className="h-16 bg-[var(--line-strong)] rounded-[4px] animate-pulse" />
          </div>
        ) : null}

        {/* Secondary Objects */}
        {secondaryObjects.length > 0 && (
          <div className="px-6 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-3">Secondaire ({secondaryObjects.length})</p>
            <div className="space-y-1.5">
              {secondaryObjects.map((obj, idx) => {
                const objType = getFocalProp(obj, "objectType") || "unknown";
                const objTitle = getFocalProp(obj, "title") || "Untitled";
                const objStatus = getFocalProp(obj, "status") || "";
                return (
                  <div key={idx} className="flex items-center gap-3 p-2 rounded-[4px] hover:bg-white/[0.02] transition-colors">
                    <span className="text-[10px] font-mono text-[var(--text-faint)] w-16 truncate">{objType}</span>
                    <span className="text-[13px] font-bold text-[var(--text-soft)] truncate flex-1">{objTitle}</span>
                    {objStatus && (
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        objStatus === "ready" ? "bg-[var(--money)]" :
                        objStatus === "awaiting_approval" ? "bg-[var(--warn)]" :
                        "bg-[var(--text-faint)]"
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Current Run */}
        {panelData?.currentRun && (
          <div className="px-6 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-3">Run actif</p>
            <div className="space-y-2 text-[12px] font-medium">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">ID</span>
                <span className="font-mono text-[var(--text-soft)] truncate max-w-[120px]">
                  {currentRunId?.slice(0, 8)}…
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Mode</span>
                <span className="text-[var(--text-soft)]">{panelData.currentRun.executionMode}</span>
              </div>
              {(panelData.currentRun.pendingToolCalls ?? 0) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">Tools</span>
                  <span className="text-[var(--cykan)]">{panelData.currentRun.pendingToolCalls} pending</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Assets */}
        {panelData?.assets && panelData.assets.length > 0 && (
          <div className="px-6 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-3">Assets ({panelData.assets.length})</p>
            <div className="space-y-2">
              {panelData.assets.slice(0, 5).map((asset) => (
                <div key={asset.id} className="flex items-center gap-3 text-[12px]">
                  <span className="font-mono text-[10px] text-[var(--text-faint)]">{asset.type}</span>
                  <span className="truncate font-bold text-[var(--text-soft)] flex-1">{asset.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missions */}
        {panelData?.missions && panelData.missions.length > 0 && (
          <div className="px-6 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-3">Missions</p>
            <div className="space-y-2">
              {panelData.missions.slice(0, 3).map((mission) => (
                <div key={mission.id} className="flex items-center justify-between p-2 rounded-[4px] hover:bg-white/[0.02] transition-colors text-[13px] font-bold">
                  <span className="truncate text-[var(--text-soft)]">{mission.name}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    mission.opsStatus === "running" ? "bg-[var(--cykan)]" :
                    mission.enabled ? "bg-[var(--money)]" : "bg-[var(--text-faint)]"
                  }`} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-faint)] text-center">
        Hearst OS
      </div>
    </aside>
  );
}
