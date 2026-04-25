"use client";

import { useRuntimeStore } from "@/stores/runtime";
import { useNavigationStore } from "@/stores/navigation";
import { useFocalStore } from "@/stores/focal";
import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import type { RightPanelData, FocalObjectView } from "@/lib/core/types";
import { mapFocalObject, mapFocalObjects } from "@/lib/focal/utils";

export function RightPanel() {
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

  // Refs to avoid stale closures in interval
  const activeThreadIdRef = useRef(activeThreadId);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  // Immediate fetch when thread changes + polling for live updates
  useEffect(() => {
    let isActive = true;

    const doFetch = async (threadId: string) => {
      try {
        setLoading(true);
        const res = await fetch(`/api/v2/right-panel?thread_id=${encodeURIComponent(threadId)}`);
        if (!isActive) return;
        if (res.ok) {
          const panelData: RightPanelData = await res.json();
          setData(panelData);
          setIsConnected(true);
        } else {
          setIsConnected(false);
        }
      } catch {
        if (isActive) setIsConnected(false);
      } finally {
        if (isActive) setLoading(false);
      }
    };

    if (activeThreadId) {
      // Fetch immediately when thread changes
      void doFetch(activeThreadId);
    }

    // Poll every 10s for live updates
    const interval = setInterval(() => {
      const currentThreadId = activeThreadIdRef.current;
      if (currentThreadId) void doFetch(currentThreadId);
    }, 10000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [activeThreadId]);

  const hasActiveThread = Boolean(activeThreadId);
  const panelData = hasActiveThread ? data : null;
  const connectionState = hasActiveThread ? isConnected : false;
  const panelLoading = hasActiveThread ? loading : false;
  const isRunning = coreState !== "idle";
  const focalObject = panelData?.focalObject;
  const secondaryObjects = panelData?.secondaryObjects || [];

  // Handle primary action execution
  const handlePrimaryAction = async () => {
    if (!focalObject) return;
    
    // Type guard for primaryAction
    const primaryAction = (focalObject as FocalObjectView).primaryAction;
    if (!primaryAction || typeof primaryAction !== "object") return;
    
    const kind = primaryAction.kind;
    if (!kind) return;
    
    setActionLoading(true);
    setActionError(null);

    try {
      let res: Response;

      if (kind === "approve" && focalObject.sourcePlanId) {
        // Approve plan
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
        // Pause mission
        res = await fetch(`/api/v2/missions/${focalObject.missionId}/pause`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } else if (kind === "resume" && focalObject.missionId) {
        // Resume mission
        res = await fetch(`/api/v2/missions/${focalObject.missionId}/resume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } else {
        throw new Error(`Unsupported action: ${kind}`);
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Action failed: ${res.status}`);
      }

      // Trigger refresh by re-fetching and sync focalStore for convergence
      if (activeThreadId) {
        try {
          setLoading(true);
          const res = await fetch(`/api/v2/right-panel?thread_id=${encodeURIComponent(activeThreadId)}`);
          if (res.ok) {
            const panelData: RightPanelData = await res.json();
            setData(panelData);
            setIsConnected(true);

            // Sync with focalStore for convergence centre ↔ RightPanel
            const hydrateThreadState = useFocalStore.getState().hydrateThreadState;
            const mappedFocal = panelData.focalObject
              ? mapFocalObject(panelData.focalObject, activeThreadId)
              : null;
            const secondary = panelData.secondaryObjects
              ? mapFocalObjects(panelData.secondaryObjects as unknown[], activeThreadId).slice(0, 3)
              : [];
            hydrateThreadState(mappedFocal, secondary);
          }
        } catch {
          setIsConnected(false);
        } finally {
          setLoading(false);
        }
      }
    } catch (err) {
      console.error("[RightPanel] Action failed:", err);
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  // Type guards for focal object
  const getFocalProp = (obj: unknown, key: string): string | undefined => {
    if (typeof obj !== "object" || obj === null) return undefined;
    const val = (obj as Record<string, unknown>)[key];
    return typeof val === "string" ? val : undefined;
  };

  // Compact display - no summary text in right panel (center is for reading)
  // Right panel shows index/metadata only

  // Extract focal object properties safely - compact index view
  const focalObjectType = focalObject ? getFocalProp(focalObject, "objectType") || "unknown" : "";
  const focalTitle = focalObject ? getFocalProp(focalObject, "title") || "Untitled" : "";
  const focalStatus = focalObject ? getFocalProp(focalObject, "status") || "" : "";

  return (
    <aside
      className="w-[240px] border-l border-[var(--line)] flex flex-col"
      style={{ background: "rgba(255,255,255,0.008)" }}
    >
      {/* Runtime Status — compact */}
      <div className="p-3 border-b border-[var(--line)]">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Runtime</p>
          <div className={`w-2 h-2 rounded-full ${connectionState ? "bg-[var(--money)]" : "bg-[var(--danger)]"}`} />
        </div>
        {coreState === "awaiting_approval" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[var(--warn)] animate-pulse" style={{ boxShadow: "0 0 6px var(--warn)" }} />
              <span className="text-sm text-[var(--warn)]">{flowLabel || "Validation requise"}</span>
            </div>
            <p className="halo-mono-tag">awaiting_approval</p>
            <div className="halo-progress">
              <div style={{ width: "100%", background: "var(--warn)" }} />
            </div>
          </div>
        ) : coreState === "awaiting_clarification" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              <span className="text-sm text-violet-400">{flowLabel || "Précision requise"}</span>
            </div>
            <p className="halo-mono-tag">awaiting_clarification</p>
            <div className="halo-progress">
              <div style={{ width: "100%", background: "#a78bfa" }} />
            </div>
          </div>
        ) : isRunning ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full bg-[var(--cykan)] animate-pulse"
                style={{ boxShadow: "0 0 6px var(--cykan)" }}
              />
              <span className="text-sm text-[var(--cykan)]">{flowLabel || "En cours..."}</span>
            </div>
            <p className="halo-mono-tag">{coreState}</p>
            <div className="halo-progress">
              <div className="animate-pulse" style={{ width: "66%" }} />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <div className="w-2 h-2 rounded-full bg-[var(--text-faint)]" />
            <span className="text-sm">Inactif</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Focal Object — Compact index entry (center is the reading surface) */}
        {focalObject ? (
          <div className="p-3 border-b border-[var(--line)]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--cykan)]">Focal</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                focalStatus === "ready" || focalStatus === "delivered" ? "bg-[var(--money)]/20 text-[var(--money)]" :
                focalStatus === "awaiting_approval" ? "bg-[var(--warn)]/20 text-[var(--warn)]" :
                focalStatus === "active" ? "bg-[var(--money)]/20 text-[var(--money)]" :
                focalStatus === "paused" ? "bg-yellow-500/20 text-yellow-400" :
                focalStatus === "composing" || focalStatus === "delivering" ? "bg-[var(--cykan)]/20 text-[var(--cykan)]" :
                focalStatus === "failed" ? "bg-[var(--danger)]/20 text-[var(--danger)]" :
                "bg-white/10 text-[var(--text-muted)]"
              }`}>
                {focalStatus === "awaiting_approval" ? "validation" :
                 focalStatus === "active" ? "actif" :
                 focalStatus === "paused" ? "pause" :
                 focalStatus}
              </span>
            </div>
            <p className="text-xs font-medium text-[var(--text)] truncate mb-1">{focalTitle}</p>
            <p className="text-[10px] text-[var(--text-faint)] mb-2">{focalObjectType}</p>

            {/* Error message */}
            {actionError && (
              <p className="text-[10px] text-[var(--danger)] mb-2">{actionError}</p>
            )}

            {/* Primary action — compact */}
            {(focalObject as FocalObjectView)?.primaryAction && (
              <button
                className={`w-full py-1.5 rounded text-[10px] font-medium uppercase tracking-wider transition-colors disabled:opacity-50 ${
                  (focalObject as FocalObjectView).primaryAction?.kind === "approve"
                    ? "bg-[var(--warn)] text-black hover:bg-[var(--warn)]/90"
                    : (focalObject as FocalObjectView).primaryAction?.kind === "pause"
                    ? "bg-yellow-500 text-black hover:bg-yellow-500/90"
                    : (focalObject as FocalObjectView).primaryAction?.kind === "resume"
                    ? "bg-[var(--money)] text-black hover:bg-[var(--money)]/90"
                    : "bg-[var(--cykan)] text-black hover:bg-[var(--cykan)]/90"
                }`}
                onClick={handlePrimaryAction}
                disabled={actionLoading}
              >
                {actionLoading ? "…" : (focalObject as FocalObjectView).primaryAction?.label}
              </button>
            )}
          </div>
        ) : panelLoading ? (
          <div className="p-3 border-b border-[var(--line)]">
            <div className="h-12 bg-white/[0.02] rounded animate-pulse" />
          </div>
        ) : null}

        {/* Secondary Objects — Liste compacte avec métadonnées */}
        {secondaryObjects.length > 0 && (
          <div className="p-4 border-b border-[var(--line)]">
            <p className="halo-mono-label mb-2">Secondaire ({secondaryObjects.length})</p>
            <div className="space-y-1.5">
              {secondaryObjects.map((obj, idx) => {
                const objType = getFocalProp(obj, "objectType") || "unknown";
                const objTitle = getFocalProp(obj, "title") || "Untitled";
                const objStatus = getFocalProp(obj, "status") || "";
                const hasPlan = !!getFocalProp(obj, "sourcePlanId");
                const hasAsset = !!getFocalProp(obj, "sourceAssetId");

                // Icon based on type
                const typeIcon =
                  objType === "report" ? "📄" :
                  objType === "brief" ? "📋" :
                  objType === "outline" ? "📑" :
                  objType === "doc" ? "📃" :
                  objType === "message_receipt" ? "✉️" :
                  objType === "message_draft" ? "✏️" :
                  objType === "mission_active" ? "🚀" :
                  objType === "mission_draft" ? "📋" :
                  objType === "watcher_active" ? "👁" :
                  objType === "watcher_draft" ? "👁‍🗨" :
                  hasPlan ? "⚙️" : hasAsset ? "📦" : "◉";

                return (
                  <div key={idx} className="flex items-center gap-2 p-2 text-xs hover:bg-white/[0.02] transition-colors">
                    <span className="text-[var(--text-muted)]">{typeIcon}</span>
                    <span className="truncate text-[var(--text-soft)] flex-1">{objTitle}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      objStatus === "ready" || objStatus === "delivered" || objStatus === "active" ? "bg-[var(--money)]" :
                      objStatus === "awaiting_approval" ? "bg-[var(--warn)]" :
                      objStatus === "composing" || objStatus === "delivering" ? "bg-[var(--cykan)] animate-pulse" :
                      objStatus === "failed" ? "bg-[var(--danger)]" :
                      "bg-[var(--text-faint)]"
                    }`} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Fallback: Recent runs (compact) */}
        {!focalObject && panelData?.recentRuns && panelData.recentRuns.length > 0 && (
          <div className="p-4">
            <p className="halo-mono-label mb-3">Runs récents</p>
            <div className="space-y-2">
              {panelData.recentRuns.slice(0, 5).map((run) => {
                const statusLabel = run.status === "awaiting_approval" ? "validation requise" :
                  run.status === "awaiting_clarification" ? "précision requise" :
                  run.status;
                return (
                  <div key={run.id} className={`p-2 text-xs ${run.id === currentRunId ? "bg-[var(--cykan)]/10 border border-[var(--cykan)]/20 rounded" : "bg-white/[0.02] rounded"}`}>
                    <p className="truncate text-[var(--text-soft)]">{run.input.slice(0, 40)}{run.input.length > 40 ? "..." : ""}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        run.status === "completed" ? "bg-[var(--money)]" :
                        run.status === "failed" ? "bg-[var(--danger)]" :
                        run.status === "running" ? "bg-[var(--cykan)] animate-pulse" :
                        run.status === "awaiting_approval" ? "bg-[var(--warn)]" :
                        run.status === "awaiting_clarification" ? "bg-violet-400" :
                        "bg-[var(--text-faint)]"
                      }`} />
                      <span className={`text-[10px] uppercase ${
                        run.status === "awaiting_approval" ? "text-[var(--warn)]" :
                        run.status === "awaiting_clarification" ? "text-violet-400" :
                        "text-[var(--text-muted)]"
                      }`}>{statusLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Assets (compact, if no focal) */}
        {!focalObject && panelData?.assets && panelData.assets.length > 0 && (
          <div className="p-4 border-t border-[var(--line)]">
            <p className="halo-mono-label mb-3">Assets ({panelData.assets.length})</p>
            <div className="space-y-2">
              {panelData.assets.slice(0, 5).map((asset) => (
                <div key={asset.id} className="flex items-center gap-2 p-2 bg-white/[0.02] text-xs hover:bg-white/[0.03] transition-colors">
                  <span className="text-[var(--text-muted)]">{asset.type === "report" ? "📄" : asset.type === "pdf" ? "📑" : asset.type === "excel" ? "📊" : "📁"}</span>
                  <span className="truncate text-[var(--text-soft)] flex-1">{asset.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missions (compact, if no focal) */}
        {!focalObject && panelData?.missions && panelData.missions.length > 0 && (
          <div className="p-4 border-t border-[var(--line)]">
            <p className="halo-mono-label mb-3">Missions</p>
            <div className="space-y-2">
              {panelData.missions.slice(0, 3).map((mission) => (
                <div key={mission.id} className="flex items-center justify-between p-2 bg-white/[0.02] text-xs hover:bg-white/[0.03] transition-colors">
                  <span className="truncate text-[var(--text-soft)]">{mission.name}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    mission.opsStatus === "running" ? "bg-[var(--cykan)] animate-pulse" :
                    mission.enabled ? "bg-[var(--money)]" : "bg-[var(--text-faint)]"
                  }`} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer — compact */}
      <div className="p-2 border-t border-[var(--line)] text-[9px] text-[var(--text-faint)] text-center font-mono">
        Hearst OS
      </div>
    </aside>
  );
}
