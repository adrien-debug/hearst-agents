"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { RightPanelData, FocalObjectView } from "@/lib/core/types";
import { mapFocalObject, mapFocalObjects } from "@/lib/core/types/focal";
import { useFocalStore } from "@/stores/focal";
import { useNavigationStore } from "@/stores/navigation";
import { useRuntimeStore } from "@/stores/runtime";

interface RightPanelContentProps {
  onClose?: () => void;
}

// Icon components
const StatusIcon = ({ state }: { state: string }) => {
  if (state === "awaiting_approval") {
    return (
      <svg className="w-5 h-5 text-[var(--warn)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 8v4M12 16h.01"/>
      </svg>
    );
  }
  if (state === "processing" || state === "running") {
    return (
      <svg className="w-5 h-5 text-[var(--cykan)] animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>
  );
};

const FileIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

const MissionIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 6v6l4 2"/>
  </svg>
);

const NodeIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="5" r="2"/>
    <circle cx="5" cy="19" r="2"/>
    <circle cx="19" cy="19" r="2"/>
    <path d="M12 7v5M7 18h10"/>
  </svg>
);

const DatabaseIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M3 5v14a9 3 0 0 0 18 0V5"/>
    <path d="M3 12a9 3 0 0 0 18 0"/>
  </svg>
);

export function RightPanelContent({ onClose }: RightPanelContentProps) {
  const router = useRouter();
  const coreState = useRuntimeStore((s) => s.coreState);
  const currentRunId = useRuntimeStore((s) => s.currentRunId);
  const flowLabel = useRuntimeStore((s) => s.flowLabel);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const { data: session } = useSession();

  const [data, setData] = useState<RightPanelData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [_loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeThreadIdRef = useRef(activeThreadId);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

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

  // Empty state when no thread
  if (!hasActiveThread) {
    return (
      <aside className="w-[320px] h-full flex flex-col z-20 relative border-l border-white/[0.05] bg-gradient-to-b from-[var(--bg-soft)] to-[var(--mat-050)]">
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-white/[0.03] flex items-center justify-center mb-4">
            <StatusIcon state="standby" />
          </div>
          <h3 className="t-15 font-medium text-white/80 mb-2">No active session</h3>
          <p className="text-xs text-white/40 leading-relaxed">
            Start a conversation to see context, assets, and missions here.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-[320px] h-full flex flex-col z-20 relative border-l border-white/[0.05] bg-gradient-to-b from-[var(--bg-soft)] via-[var(--surface)] to-[var(--mat-050)]">
      {/* Mobile header */}
      {onClose && (
        <div className="p-4 flex items-center justify-between md:hidden border-b border-white/[0.05]">
          <p className="text-sm font-medium">Context</p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-white/60">
            ✕
          </button>
        </div>
      )}

      {/* Status Card */}
      <div className="p-5 border-b border-white/[0.05]">
        <div className="flex items-center gap-3 mb-4">
          <StatusIcon state={coreState === "awaiting_approval" ? "awaiting_approval" : isRunning ? "processing" : "standby"} />
          <div>
            <p className="t-13 font-medium text-white">
              {coreState === "awaiting_approval" ? (flowLabel || "Needs approval") : 
               isRunning ? (flowLabel || "Processing") : "Ready"}
            </p>
            <p className="t-11 text-white/40">
              {isConnected ? "Connected" : "Disconnected"}
            </p>
          </div>
        </div>
        
        {/* Progress bar */}
        {(isRunning || coreState === "awaiting_approval") && (
          <div className="h-1 bg-white/[0.08] rounded-full overflow-hidden">
            <div 
              className={`h-full ${coreState === "awaiting_approval" ? "bg-[var(--warn)]" : "bg-[var(--cykan)]"} ${isRunning ? "animate-pulse" : ""}`}
              style={{ width: coreState === "awaiting_approval" ? "100%" : "66%" }}
            />
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* Focal Object Card */}
        {focalObject && (
          <div className="p-5 border-b border-white/[0.05]">
            <div className="flex items-center gap-2 text-[var(--cykan)] mb-3">
              <FileIcon />
              <span className="t-11 font-medium uppercase tracking-wide">{focalObjectType}</span>
            </div>
            <h3 className="t-15 font-medium text-white mb-1 leading-snug">{focalTitle}</h3>
            
            {actionError && (
              <p className="mt-3 t-11 text-[var(--danger)] bg-[var(--danger)]/10 px-3 py-2 rounded">{actionError}</p>
            )}

            {(focalObject as FocalObjectView)?.primaryAction && (
              <button
                className={`mt-4 w-full py-3 text-xs font-medium rounded transition-colors ${
                  (focalObject as FocalObjectView).primaryAction?.kind === "approve"
                    ? "bg-white text-black hover:bg-white/90"
                    : "bg-[var(--cykan)] text-black hover:bg-[var(--cykan)]/90"
                }`}
                onClick={handlePrimaryAction}
                disabled={actionLoading}
              >
                {actionLoading ? "Processing..." : (focalObject as FocalObjectView).primaryAction?.label}
              </button>
            )}
          </div>
        )}

        {/* Secondary Nodes */}
        {secondaryObjects.length > 0 && (
          <div className="p-5 border-b border-white/[0.05]">
            <div className="flex items-center gap-2 text-white/40 mb-4">
              <NodeIcon />
              <span className="t-11 font-medium uppercase tracking-wide">Related</span>
            </div>
            <div className="space-y-3">
              {secondaryObjects.map((obj, idx) => {
                const objType = getFocalProp(obj, "objectType") || "unknown";
                const objTitle = getFocalProp(obj, "title") || "Untitled";
                const objStatus = getFocalProp(obj, "status") || "";
                return (
                  <div key={idx} className="flex items-center justify-between group cursor-pointer py-2 hover:bg-white/[0.02] -mx-2 px-2 rounded transition-colors">
                    <div>
                      <p className="text-xs text-white/70 group-hover:text-white transition-colors">{objTitle}</p>
                      <p className="t-10 text-white/30">{objType}</p>
                    </div>
                    {objStatus && (
                      <span className={`w-2 h-2 rounded-full ${
                        objStatus === "ready" ? "bg-[var(--cykan)]" :
                        objStatus === "awaiting_approval" ? "bg-[var(--warn)]" :
                        "bg-white/20"
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Assets */}
        {panelData?.assets && panelData.assets.length > 0 && (
          <div className="p-5 border-b border-white/[0.05]">
            <div className="flex items-center gap-2 text-white/40 mb-4">
              <DatabaseIcon />
              <span className="t-11 font-medium uppercase tracking-wide">Assets</span>
              <span className="ml-auto t-10 text-white/30">{panelData.assets.length}</span>
            </div>
            <div className="space-y-2">
              {panelData.assets.slice(0, 5).map((asset) => (
                <div 
                  key={asset.id} 
                  onClick={() => router.push(`/assets?id=${asset.id}`)}
                  className="flex items-center justify-between group cursor-pointer py-2 hover:bg-white/[0.02] -mx-2 px-2 rounded transition-colors"
                >
                  <p className="text-xs text-white/60 group-hover:text-white transition-colors truncate pr-4">{asset.name}</p>
                  <span className="t-10 text-white/30 uppercase">{asset.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missions */}
        {panelData?.missions && panelData.missions.length > 0 && (
          <div className="p-5 border-b border-white/[0.05]">
            <div className="flex items-center gap-2 text-white/40 mb-4">
              <MissionIcon />
              <span className="t-11 font-medium uppercase tracking-wide">Missions</span>
              <span className="ml-auto t-10 text-white/30">{panelData.missions.length}</span>
            </div>
            <div className="space-y-2">
              {panelData.missions.slice(0, 3).map((mission) => (
                <div 
                  key={mission.id} 
                  onClick={() => router.push(`/missions?id=${mission.id}`)}
                  className="flex items-center justify-between group cursor-pointer py-2 hover:bg-white/[0.02] -mx-2 px-2 rounded transition-colors"
                >
                  <p className="text-xs text-white/60 group-hover:text-white transition-colors truncate pr-4">{mission.name}</p>
                  <span className={`w-2 h-2 rounded-full ${
                    mission.opsStatus === "running" ? "bg-[var(--cykan)]" :
                    mission.enabled ? "bg-[var(--cykan)]/50" : "bg-white/20"
                  }`} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Run Info */}
        {panelData?.currentRun && (
          <div className="p-5">
            <div className="flex items-center gap-2 text-white/40 mb-4">
              <DatabaseIcon />
              <span className="t-11 font-medium uppercase tracking-wide">Run details</span>
            </div>
            <div className="space-y-2 t-11">
              <div className="flex justify-between">
                <span className="text-white/30">ID</span>
                <span className="text-white/60 font-mono">{currentRunId?.slice(0, 12)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/30">Mode</span>
                <span className="text-[var(--cykan)]">{panelData.currentRun.executionMode}</span>
              </div>
              {(panelData.currentRun.pendingToolCalls ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-white/30">Pending</span>
                  <span className="text-[var(--cykan)]">{panelData.currentRun.pendingToolCalls}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
