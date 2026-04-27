"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { RightPanelData, FocalObjectView } from "@/lib/core/types";
import { mapFocalObject, mapFocalObjects } from "@/lib/core/types/focal";
import { useFocalStore } from "@/stores/focal";
import { useNavigationStore } from "@/stores/navigation";
import { useRuntimeStore, type StreamEvent } from "@/stores/runtime";
import { missionToFocal, assetToFocal } from "@/lib/ui/focal-mappers";
import { getToolCatalogEntry } from "./tool-catalog";

interface RightPanelContentProps {
  onClose?: () => void;
}

// Icon components
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

// ── Activity feed helpers ─────────────────────────────────────

const ACTIVITY_EVENT_TYPES = new Set([
  "tool_call_started",
  "tool_call_completed",
  "step_started",
  "step_completed",
  "orchestrator_log",
]);

function activityIcon(type: string): string {
  if (type === "tool_call_started") return "⚡";
  if (type === "tool_call_completed") return "✓";
  if (type === "step_started") return "▶";
  if (type === "step_completed") return "□";
  return "·";
}

function activityLabel(event: StreamEvent): string {
  if (event.type === "tool_call_started" || event.type === "tool_call_completed") {
    const tool = (event.tool as string) ?? "";
    const entry = getToolCatalogEntry(tool);
    const verb = event.type === "tool_call_started" ? entry.runningVerb : entry.completedVerb;
    return `${entry.icon} ${entry.label} — ${verb}`;
  }
  if (event.type === "step_started" || event.type === "step_completed") {
    return (event.title as string) ?? (event.agent as string) ?? event.type;
  }
  if (event.type === "orchestrator_log") {
    const msg = (event.message as string) ?? "";
    return msg.length > 60 ? msg.slice(0, 57) + "…" : msg;
  }
  return event.type;
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
  const runtimeEvents = useRuntimeStore((s) => s.events);
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

  // Re-fetch panel data when an asset is generated during a run
  const lastAssetEventTsRef = useRef<number>(0);
  useEffect(() => {
    const assetEvent = runtimeEvents.find((e) => e.type === "asset_generated");
    if (!assetEvent || !activeThreadId) return;
    if (assetEvent.timestamp <= lastAssetEventTsRef.current) return;
    lastAssetEventTsRef.current = assetEvent.timestamp;
    fetch(`/api/v2/right-panel?thread_id=${encodeURIComponent(activeThreadId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((panelData: RightPanelData | null) => {
        if (panelData) setData(panelData);
      })
      .catch(() => {});
  }, [runtimeEvents, activeThreadId]);

  useEffect(() => {
    // ── No active thread: render the panel as a "library home"
    // by pulling missions + assets from the global APIs (not the
    // per-thread SSE stream). Keeps the panel useful before the
    // user opens any conversation, and removes the need for the
    // dedicated LIBRARY_ITEMS rail in the LeftPanel.
    if (!activeThreadId) {
      let cancelled = false;
      setLoading(true);
      void Promise.all([
        fetch("/api/v2/missions", { credentials: "include" })
          .then((r) => (r.ok ? r.json() : { missions: [] }))
          .catch(() => ({ missions: [] })),
        fetch("/api/v2/assets", { credentials: "include" })
          .then((r) => (r.ok ? r.json() : { assets: [] }))
          .catch(() => ({ assets: [] })),
      ]).then(([mResp, aResp]) => {
        if (cancelled) return;
        const missions = (mResp.missions ?? []) as RightPanelData["missions"];
        const rawAssets = (aResp.assets ?? []) as Array<Record<string, unknown>>;
        const assets = rawAssets.map((a): RightPanelData["assets"][number] => ({
          id: String(a.id ?? ""),
          name: String(a.name ?? a.title ?? "Untitled"),
          type: String(a.type ?? a.kind ?? "doc"),
          runId: String(a.run_id ?? a.runId ?? ""),
        }));
        setData({
          assets,
          missions,
          focalObject: undefined,
          secondaryObjects: undefined,
        } as RightPanelData);
        setIsConnected(false);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
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

  // Live activity: filter to actionable event types, newest-first, cap at 8
  const activityEvents = runtimeEvents
    .filter((e) => ACTIVITY_EVENT_TYPES.has(e.type))
    .slice(0, 8);
  const secondaryObjects = panelData?.secondaryObjects || [];

  const getFocalProp = (obj: unknown, key: string): string | undefined => {
    if (typeof obj !== "object" || obj === null) return undefined;
    const val = (obj as Record<string, unknown>)[key];
    return typeof val === "string" ? val : undefined;
  };

  const focalObjectType = focalObject ? getFocalProp(focalObject, "objectType") || "unknown" : "";
  const focalTitle = focalObject ? getFocalProp(focalObject, "title") || "Untitled" : "";

  // The panel is *persistent*: it stays mounted even when no thread is
  // active. In that "library mode" the status card switches to a softer
  // standby label and the rest of the UI (Missions / Assets sections)
  // continues to render — fed by the global APIs in the effect above.
  const stateLabel = !hasActiveThread
    ? "Library"
    : coreState === "awaiting_approval"
      ? (flowLabel || "Needs approval")
      : isRunning
        ? (flowLabel || "Processing")
        : "Ready";

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
          <span className="t-9 font-mono tracking-[0.3em] text-[var(--text-faint)] uppercase">
            {hasActiveThread ? "Status" : "Mode"}
          </span>
          <span className={`flex items-center gap-2 t-9 font-mono tracking-[0.2em] uppercase ${
            !hasActiveThread ? "text-[var(--text-faint)]" :
            coreState === "awaiting_approval" ? "text-[var(--warn)]" :
            isRunning ? "text-[var(--cykan)] halo-cyan-sm" : "text-[var(--text-faint)]"
          }`}>
            <span className={`w-1 h-1 rounded-full ${
              !hasActiveThread ? "bg-[var(--text-ghost)]" :
              coreState === "awaiting_approval" ? "bg-[var(--warn)]" :
              isRunning ? "bg-[var(--cykan)] animate-pulse halo-dot" : "bg-[var(--text-faint)]"
            }`} />
            {!hasActiveThread ? "standby" : isConnected ? "live" : "offline"}
          </span>
        </div>
        <p className={`t-18 font-light tracking-tight ${isRunning ? "text-[var(--text)] halo-cyan-sm" : "text-[var(--text)]"}`}>{stateLabel}</p>

        {isRunning && (
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
        {panelData?.assets && panelData.assets.filter((a) => a.name && a.name !== "Untitled").length > 0 && (
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
                <span className="t-9 font-mono tracking-[0.2em]">{panelData.assets.filter((a) => a.name && a.name !== "Untitled").length}</span>
                <span className="t-9 font-mono opacity-0 group-hover/header:opacity-100 -translate-x-1 group-hover/header:translate-x-0 transition-all">→</span>
              </span>
            </button>
            <div className="space-y-px">
              {panelData.assets
                .filter((a) => a.name && a.name !== "Untitled")
                .slice(0, 5)
                .map((asset) => (
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
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const res = await fetch(`/api/v2/assets/${encodeURIComponent(asset.id)}`, { method: "DELETE" });
                        if (res.ok) setData((prev) => prev ? { ...prev, assets: prev.assets.filter((a) => a.id !== asset.id) } : prev);
                      } catch { /* silent */ }
                    }}
                    className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-[var(--text-ghost)] hover:text-[var(--danger)] transition-all shrink-0"
                    title="Supprimer"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
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
          <div className="px-6 pt-7 pb-7 border-b border-[var(--surface-2)]">
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

        {/* Live Activity — shown when a run is active */}
        {(isRunning || activityEvents.length > 0) && (
          <div className="px-6 pt-7 pb-6 border-b border-[var(--surface-2)]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[var(--text-faint)]">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                <span className="t-9 font-mono tracking-[0.3em] uppercase">Activity</span>
              </div>
              {isRunning && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--cykan)] animate-pulse halo-dot" />
              )}
            </div>
            {activityEvents.length === 0 ? (
              <p className="t-11 text-[var(--text-ghost)] font-mono">En attente…</p>
            ) : (
              <div className="space-y-1">
                {activityEvents.map((event, i) => (
                  <div
                    key={`${event.type}-${event.timestamp}-${i}`}
                    className={`flex items-start gap-2.5 py-1.5 ${i === 0 && isRunning ? "opacity-100" : "opacity-60"}`}
                  >
                    <span className={`t-9 font-mono shrink-0 mt-0.5 ${
                      event.type === "tool_call_started" ? "text-[var(--cykan)]" :
                      event.type === "tool_call_completed" ? "text-[var(--success,#22c55e)]" :
                      event.type === "step_started" ? "text-[var(--warn)]" :
                      "text-[var(--text-ghost)]"
                    }`}>
                      {activityIcon(event.type)}
                    </span>
                    <p className="t-11 font-light text-[var(--text-muted)] truncate leading-snug">
                      {activityLabel(event)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty idle state */}
        {!isRunning && activityEvents.length === 0 && !focalObject && !panelData?.assets?.length && !panelData?.missions?.length && (
          <div className="px-6 pt-10 pb-6 flex flex-col items-center text-center gap-2">
            <span className="t-9 font-mono tracking-[0.3em] uppercase text-[var(--text-ghost)]">Prêt</span>
          </div>
        )}
      </div>
    </aside>
  );
}
