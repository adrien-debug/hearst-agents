"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { RightPanelData, FocalObjectView } from "@/lib/core/types";
import { mapFocalObject, mapFocalObjects } from "@/lib/core/types/focal";
import { useFocalStore } from "@/stores/focal";
import { useNavigationStore } from "@/stores/navigation";
import { useRuntimeStore } from "@/stores/runtime";
import { missionToFocal, assetToFocal } from "@/lib/ui/focal-mappers";

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
    <svg className="w-5 h-5 text-[var(--text-faint)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return "—";
  const diff = Date.now() - timestamp;
  if (diff < 0) return "à venir";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days}j`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `il y a ${weeks}sem`;
  const months = Math.floor(days / 30);
  return `il y a ${months}mo`;
}

const ASSET_TYPE_GLYPH: Record<string, string> = {
  report: "▦",
  brief: "≡",
  message: "✉",
  document: "▤",
  synthesis: "◇",
  plan: "◈",
};

function assetGlyph(type: string): string {
  return ASSET_TYPE_GLYPH[type.toLowerCase()] || "·";
}

// `missionToFocal` and `assetToFocal` now live in `lib/ui/focal-mappers`
// so /missions, /assets and this right-panel preview render the same shape.
// Keep `formatRelativeTime` available for other right-panel rendering.

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
      <aside className="w-[320px] h-full flex flex-col z-20 relative border-l border-[var(--surface-2)] bg-gradient-to-b from-[var(--bg-soft)] to-[var(--mat-050)]">
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-[var(--surface-2)] flex items-center justify-center mb-4">
            <StatusIcon state="standby" />
          </div>
          <h3 className="t-15 font-medium text-[var(--text-soft)] mb-2">No active session</h3>
          <p className="text-xs text-[var(--text-faint)] leading-relaxed">
            Start a conversation to see context, assets, and missions here.
          </p>
        </div>
      </aside>
    );
  }

  const stateLabel =
    coreState === "awaiting_approval" ? (flowLabel || "Needs approval") :
    isRunning ? (flowLabel || "Processing") : "Ready";

  return (
    <aside className="w-[320px] h-full flex flex-col z-20 relative border-l border-[var(--surface-2)] bg-gradient-to-b from-[var(--bg-soft)] via-[var(--surface)] to-[var(--mat-050)]">
      {/* Mobile header */}
      {onClose && (
        <div className="p-4 flex items-center justify-between md:hidden border-b border-[var(--surface-2)]">
          <p className="text-sm font-medium">Context</p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)]">
            ✕
          </button>
        </div>
      )}

      {/* Status Card — refined hierarchy */}
      <div className="px-6 pt-7 pb-6 border-b border-[var(--surface-2)]">
        <div className="flex items-center justify-between mb-3">
          <span className="t-9 font-mono tracking-[0.3em] text-[var(--text-faint)] uppercase">Status</span>
          <span className={`flex items-center gap-2 t-9 font-mono tracking-[0.2em] uppercase ${
            coreState === "awaiting_approval" ? "text-[var(--warn)]" :
            isRunning ? "text-[var(--cykan)] halo-cyan-sm" : "text-[var(--text-faint)]"
          }`}>
            <span className={`w-1 h-1 rounded-full ${
              coreState === "awaiting_approval" ? "bg-[var(--warn)]" :
              isRunning ? "bg-[var(--cykan)] animate-pulse halo-dot" : "bg-[var(--text-faint)]"
            }`} />
            {isConnected ? "live" : "offline"}
          </span>
        </div>
        <p className={`t-18 font-light tracking-tight ${isRunning ? "text-[var(--text)] halo-cyan-sm" : "text-[var(--text)]"}`}>{stateLabel}</p>

        {(isRunning || coreState === "awaiting_approval") && (
          <div className="h-px bg-[var(--surface-2)] mt-5 overflow-hidden">
            <div
              className={`h-full ${coreState === "awaiting_approval" ? "bg-[var(--warn)]" : "bg-[var(--cykan)] halo-rule"} ${isRunning ? "animate-pulse" : ""}`}
              style={{ width: coreState === "awaiting_approval" ? "100%" : "66%" }}
            />
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* Focal Object Card — bracketed signature with halo */}
        {focalObject && (
          <div className="px-6 pt-7 pb-6 border-b border-[var(--surface-2)] relative">
            <span className="absolute top-5 right-5 t-9 font-mono text-[var(--cykan)] opacity-60 halo-cyan-sm">]</span>
            <span className="absolute top-5 left-5 t-9 font-mono text-[var(--cykan)] opacity-60 halo-cyan-sm">[</span>
            <div className="flex items-center gap-2 text-[var(--cykan)] mb-3 pl-3 halo-cyan-sm">
              <FileIcon />
              <span className="t-9 font-mono tracking-[0.3em] uppercase">{focalObjectType}</span>
            </div>
            <h3 className="t-15 font-medium text-[var(--text)] mb-1 leading-snug pl-3">{focalTitle}</h3>

            {actionError && (
              <p className="mt-3 t-11 text-[var(--danger)] bg-[var(--danger)]/10 px-3 py-2 rounded">{actionError}</p>
            )}

            {(focalObject as FocalObjectView)?.primaryAction && (
              <button
                className={`mt-5 w-full py-3 t-11 font-mono tracking-[0.2em] uppercase rounded-sm transition-colors ${
                  (focalObject as FocalObjectView).primaryAction?.kind === "approve"
                    ? "bg-[var(--text)] text-[var(--bg)] hover:bg-[var(--text-soft)]"
                    : "bg-[var(--cykan)] text-[var(--bg)] hover:bg-[var(--cykan)]/90"
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
          <div className="px-6 pt-7 pb-6 border-b border-[var(--surface-2)]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2 text-[var(--text-faint)]">
                <NodeIcon />
                <span className="t-9 font-mono tracking-[0.3em] uppercase">Related</span>
              </div>
            </div>
            <div className="space-y-1">
              {secondaryObjects.map((obj, idx) => {
                const objType = getFocalProp(obj, "objectType") || "unknown";
                const objTitle = getFocalProp(obj, "title") || "Untitled";
                const objStatus = getFocalProp(obj, "status") || "";
                return (
                  <div key={idx} className="flex items-center gap-3 group cursor-pointer py-2 -mx-2 px-2 hover:bg-[var(--surface-1)] transition-colors">
                    {objStatus && (
                      <span className={`w-1 h-1 rounded-full shrink-0 ${
                        objStatus === "ready" ? "bg-[var(--cykan)]" :
                        objStatus === "awaiting_approval" ? "bg-[var(--warn)]" :
                        "bg-[var(--text-ghost)]"
                      }`} />
                    )}
                    <p className="t-13 font-light text-[var(--text-muted)] group-hover:text-[var(--text)] transition-colors truncate flex-1">{objTitle}</p>
                    <span className="t-9 font-mono tracking-[0.2em] text-[var(--text-ghost)] uppercase shrink-0">{objType}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Assets — editorial list */}
        {panelData?.assets && panelData.assets.length > 0 && (
          <div className="px-6 pt-7 pb-6 border-b border-[var(--surface-2)]">
            <button
              onClick={() => router.push("/assets")}
              className="halo-on-hover w-full flex items-center justify-between mb-5 group/header text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors"
              title="View all assets"
            >
              <span className="flex items-center gap-2">
                <DatabaseIcon />
                <span className="t-9 font-mono tracking-[0.3em] uppercase">Assets</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="t-9 font-mono tracking-[0.2em]">{panelData.assets.length}</span>
                <span className="t-9 font-mono opacity-0 group-hover/header:opacity-100 -translate-x-1 group-hover/header:translate-x-0 transition-all">→</span>
              </span>
            </button>
            <div className="space-y-px">
              {panelData.assets.slice(0, 5).map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => useFocalStore.getState().setFocal(assetToFocal(asset, activeThreadId))}
                  className="group cursor-pointer py-3 -mx-2 px-2 hover:bg-[var(--surface-1)] transition-colors flex items-start gap-3"
                  title={`Open ${asset.name}`}
                >
                  <span className="t-13 text-[var(--cykan)] opacity-30 group-hover:opacity-100 transition-opacity shrink-0 leading-none mt-1">
                    {assetGlyph(asset.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="t-13 font-light text-[var(--text-muted)] group-hover:text-[var(--text)] transition-colors truncate">{asset.name}</p>
                    <p className="t-9 font-mono tracking-[0.2em] text-[var(--text-ghost)] uppercase mt-1">{asset.type}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missions — with relative time */}
        {panelData?.missions && (
          <div className="px-6 pt-7 pb-6 border-b border-[var(--surface-2)]">
            <button
              onClick={() => router.push("/missions")}
              className="halo-on-hover w-full flex items-center justify-between mb-5 group/header text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors"
              title="View all missions"
            >
              <span className="flex items-center gap-2">
                <MissionIcon />
                <span className="t-9 font-mono tracking-[0.3em] uppercase">Missions</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="t-9 font-mono tracking-[0.2em]">{panelData.missions.length}</span>
                <span className="t-9 font-mono opacity-0 group-hover/header:opacity-100 -translate-x-1 group-hover/header:translate-x-0 transition-all">→</span>
              </span>
            </button>
            {panelData.missions.length > 0 && (
              <div className="space-y-px mb-3">
                {panelData.missions.slice(0, 3).map((mission) => (
                  <div
                    key={mission.id}
                    onClick={() => useFocalStore.getState().setFocal(missionToFocal(mission, activeThreadId))}
                    className="group cursor-pointer py-3 -mx-2 px-2 hover:bg-[var(--surface-1)] transition-colors flex items-center gap-3"
                    title={`Open ${mission.name}`}
                  >
                    <span className={`w-1 h-1 rounded-full shrink-0 ${
                      mission.opsStatus === "running" ? "bg-[var(--cykan)] animate-pulse halo-dot" :
                      mission.opsStatus === "failed" ? "bg-[var(--danger)]" :
                      mission.enabled ? "bg-[var(--cykan)] opacity-50" : "bg-[var(--text-ghost)]"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="t-13 font-light text-[var(--text-muted)] group-hover:text-[var(--text)] transition-colors truncate">{mission.name}</p>
                    </div>
                    <span className="t-9 font-mono tracking-[0.2em] text-[var(--text-ghost)] uppercase shrink-0">
                      {mission.lastRunAt ? formatRelativeTime(mission.lastRunAt) : (mission.enabled ? "armé" : "off")}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => router.push("/missions?new=1")}
              className="halo-on-hover w-full mt-2 flex items-center justify-center gap-2 py-2.5 t-9 font-mono uppercase tracking-[0.3em] text-[var(--text-faint)] hover:text-[var(--cykan)] border border-dashed border-[var(--surface-2)] hover:border-[var(--line-active)] transition-all"
              title="New mission"
            >
              <span className="text-base leading-none">+</span> New mission
            </button>
          </div>
        )}

        {/* Run Info */}
        {panelData?.currentRun && (
          <div className="px-6 pt-7 pb-7">
            <div className="flex items-center gap-2 text-[var(--text-faint)] mb-5">
              <DatabaseIcon />
              <span className="t-9 font-mono tracking-[0.3em] uppercase">Run details</span>
            </div>
            <div className="space-y-3 t-11">
              <div className="flex justify-between">
                <span className="font-mono tracking-[0.2em] text-[var(--text-faint)] uppercase">ID</span>
                <span className="text-[var(--text-muted)] font-mono">{currentRunId?.slice(0, 12)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono tracking-[0.2em] text-[var(--text-faint)] uppercase">Mode</span>
                <span className="text-[var(--cykan)] font-mono">{panelData.currentRun.executionMode}</span>
              </div>
              {(panelData.currentRun.pendingToolCalls ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="font-mono tracking-[0.2em] text-[var(--text-faint)] uppercase">Pending</span>
                  <span className="text-[var(--cykan)] font-mono">{panelData.currentRun.pendingToolCalls}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
