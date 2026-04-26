"use client";

/**
 * RightPanelContent — Panel internals (extracted for responsive wrapper)
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

  /** Live updates via SSE (~1s) */
  useEffect(() => {
    if (!activeThreadId) {
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

  return (
    <aside
      className="w-[380px] h-full flex flex-col z-20 relative border-l border-white/[0.03] shadow-[-30px_0_60px_rgba(0,0,0,0.4)]"
      style={{ background: "linear-gradient(to left, var(--mat-100), #020202)" }}
    >
      {/* Header with close button for mobile */}
      {onClose && (
        <div className="p-6 flex items-center justify-between md:hidden">
          <p className="text-[13px] font-medium tracking-wide">Runtime</p>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-sm hover:bg-white/[0.05] transition-colors"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Runtime Status */}
      <div className="p-10 bg-white/[0.01] border-b border-white/[0.03]">
        <div className="flex items-center justify-between mb-10">
          <p className="text-[10px] font-mono font-black uppercase tracking-[0.8em] text-white/10">System_HUD</p>
          <div className={`w-1 h-1 rounded-full ${isConnected ? "bg-[var(--cykan)] shadow-[0_0_12px_var(--cykan)]" : "bg-[var(--danger)]"}`} />
        </div>
        {coreState === "awaiting_approval" ? (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <span className="text-[18px] font-black uppercase tracking-tighter text-[var(--warn)]">{flowLabel || "Validation"}</span>
            </div>
            <div className="h-[2px] bg-white/[0.05] relative">
              <div className="absolute inset-0 bg-[var(--warn)] w-full shadow-[0_0_20px_var(--warn)]" />
            </div>
          </div>
        ) : isRunning ? (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <span className="text-[18px] font-black uppercase tracking-tighter text-[var(--cykan)]">{flowLabel || "Processing"}</span>
            </div>
            <div className="h-[2px] bg-white/[0.05] relative">
              <div className="absolute inset-0 bg-[var(--cykan)] shadow-[0_0_30px_var(--cykan)] animate-pulse" style={{ width: "66%" }} />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 text-[var(--text-muted)] opacity-30">
            <span className="text-[18px] font-black uppercase tracking-tighter">Standby</span>
          </div>
        )}
      </div>

      {/* Focal Object */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {focalObject ? (
          <div className="px-10 py-16 bg-black/40 border-b border-white/[0.03]">
            <div className="flex items-center justify-between mb-10">
              <p className="text-[10px] font-mono font-black uppercase tracking-[0.8em] text-white/10">Focal_Object</p>
            </div>
            <p className="text-[24px] font-black text-white uppercase tracking-tighter mb-4 leading-[1.1]">{focalTitle}</p>
            <p className="text-[11px] font-mono text-[var(--cykan)] uppercase tracking-[0.5em] mb-12 opacity-40">{focalObjectType}</p>

            {actionError && (
              <p className="text-[11px] font-mono text-[var(--danger)] mb-10 p-8 bg-[var(--danger)]/5 border-l-2 border-[var(--danger)] uppercase tracking-widest">{actionError}</p>
            )}

            {(focalObject as FocalObjectView)?.primaryAction && (
              <button
                className={`w-full py-6 text-[11px] font-mono font-black uppercase tracking-[0.5em] transition-all duration-700 hover:tracking-[0.7em] ${
                  (focalObject as FocalObjectView).primaryAction?.kind === "approve"
                    ? "bg-white text-black shadow-[0_30px_60px_rgba(255,255,255,0.08)]"
                    : "bg-[var(--cykan)] text-black shadow-[0_30px_60px_rgba(163,255,0,0.15)]"
                }`}
                onClick={handlePrimaryAction}
                disabled={actionLoading}
              >
                {actionLoading ? "RUNNING_" : (focalObject as FocalObjectView).primaryAction?.label}
              </button>
            )}
          </div>
        ) : loading ? (
          <div className="px-10 py-16">
            <div className="h-[2px] bg-white/[0.05] animate-pulse" />
          </div>
        ) : null}

        {/* Secondary Objects */}
        {secondaryObjects.length > 0 && (
          <div className="px-10 py-12 border-b border-white/[0.03]">
            <p className="text-[10px] font-mono font-black uppercase tracking-[0.8em] text-white/10 mb-8">Secondary_Nodes</p>
            <div className="space-y-6">
              {secondaryObjects.map((obj, idx) => {
                const objType = getFocalProp(obj, "objectType") || "unknown";
                const objTitle = getFocalProp(obj, "title") || "Untitled";
                const objStatus = getFocalProp(obj, "status") || "";
                return (
                  <div key={idx} className="flex flex-col gap-2 group cursor-pointer">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono text-white/10 uppercase tracking-[0.4em] group-hover:text-[var(--cykan)] transition-colors">{objType}</span>
                      {objStatus && (
                        <span className={`w-1 h-1 rounded-full ${
                          objStatus === "ready" ? "bg-[var(--cykan)] shadow-[0_0_8px_var(--cykan)]" :
                          objStatus === "awaiting_approval" ? "bg-[var(--warn)]" :
                          "bg-white/5"
                        }`} />
                      )}
                    </div>
                    <span className="text-[14px] font-black text-white/30 uppercase tracking-tighter group-hover:text-white transition-colors truncate">{objTitle}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Current Run */}
        {panelData?.currentRun && (
          <div className="px-10 py-12 border-b border-white/[0.03] bg-white/[0.005]">
            <p className="text-[10px] font-mono font-black uppercase tracking-[0.8em] text-white/10 mb-8">Process_Metrics</p>
            <div className="space-y-4 text-[12px] font-mono uppercase tracking-[0.2em]">
              <div className="flex items-center justify-between">
                <span className="text-white/20">Run_ID</span>
                <span className="text-white/60 truncate max-w-[140px]">
                  {currentRunId?.slice(0, 16)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/20">Mode</span>
                <span className="text-[var(--cykan)] font-black opacity-80">{panelData.currentRun.executionMode}</span>
              </div>
              {(panelData.currentRun.pendingToolCalls ?? 0) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-white/20">Stack</span>
                  <span className="text-[var(--cykan)] font-black opacity-80">{panelData.currentRun.pendingToolCalls} PENDING_</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Assets */}
        {panelData?.assets && panelData.assets.length > 0 && (
          <div className="px-10 py-12 border-b border-white/[0.03]">
            <p className="text-[10px] font-mono font-black uppercase tracking-[0.8em] text-white/10 mb-8">Data_Assets</p>
            <div className="space-y-5">
              {panelData.assets.slice(0, 5).map((asset) => (
                <div key={asset.id} className="flex flex-col gap-1.5 group cursor-pointer">
                  <span className="font-mono text-[9px] text-white/10 uppercase tracking-[0.3em] group-hover:text-[var(--cykan)] transition-colors">{asset.type}</span>
                  <span className="truncate font-black text-[13px] uppercase tracking-tighter text-white/30 group-hover:text-white transition-colors">{asset.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missions */}
        {panelData?.missions && panelData.missions.length > 0 && (
          <div className="px-10 py-12 border-b border-white/[0.03]">
            <p className="text-[10px] font-mono font-black uppercase tracking-[0.8em] text-white/10 mb-8">Active_Missions</p>
            <div className="space-y-6">
              {panelData.missions.slice(0, 3).map((mission) => (
                <div key={mission.id} className="flex items-center justify-between group cursor-pointer">
                  <span className="truncate text-[14px] font-black uppercase tracking-tighter text-white/30 group-hover:text-white transition-colors">{mission.name}</span>
                  <span className={`w-1 h-1 rounded-full ${
                    mission.opsStatus === "running" ? "bg-[var(--cykan)] shadow-[0_0_10px_var(--cykan)]" :
                    mission.enabled ? "bg-[var(--cykan)]/30" : "bg-white/5"
                  }`} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-10 text-[10px] font-mono font-black uppercase tracking-[0.8em] text-white/5 text-center">
        Hearst_OS_v3.0
      </div>
    </aside>
  );
}
