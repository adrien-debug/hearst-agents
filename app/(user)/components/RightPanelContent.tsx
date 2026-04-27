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
import { toast } from "@/app/hooks/use-toast";
import { RunHaloIndicator } from "./RunHaloIndicator";
import {
  FileIcon,
  MissionIcon,
  NodeIcon,
  DatabaseIcon,
  ActivityIcon,
} from "./right-panel-icons";
import {
  formatRelativeTime,
  ACTIVITY_EVENT_TYPES,
  activityIcon,
  activityLabel,
  assetGlyph,
  EmptyState,
} from "./right-panel-helpers";

interface RightPanelContentProps {
  onClose?: () => void;
}

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
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeThreadIdRef = useRef(activeThreadId);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

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
    // No active thread → render the panel as a "library home" by pulling
    // missions + assets from the global APIs (not the per-thread SSE stream).
    if (!activeThreadId) {
      let cancelled = false;
      Promise.resolve().then(() => {
        if (!cancelled) setLoading(true);
      });
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
  const panelData = data;
  const isRunning = coreState !== "idle";
  const focalObject = panelData?.focalObject;

  const activityEvents = runtimeEvents
    .filter((e) => ACTIVITY_EVENT_TYPES.has(e.type))
    .slice(0, 8);
  const secondaryObjects = panelData?.secondaryObjects || [];
  const assets = panelData?.assets ?? [];
  const missions = panelData?.missions ?? [];

  const getFocalProp = (obj: unknown, key: string): string | undefined => {
    if (typeof obj !== "object" || obj === null) return undefined;
    const val = (obj as Record<string, unknown>)[key];
    return typeof val === "string" ? val : undefined;
  };

  const focalObjectType = focalObject ? getFocalProp(focalObject, "objectType") || "unknown" : "";
  const focalTitle = focalObject ? getFocalProp(focalObject, "title") || "Untitled" : "";

  const stateLabel = !hasActiveThread
    ? "Bibliothèque"
    : coreState === "awaiting_approval"
      ? (flowLabel || "Validation requise")
      : isRunning
        ? (flowLabel || "Traitement")
        : "Prêt";

  return (
    <aside
      className="h-full flex flex-col z-20 relative border-l border-[var(--border-shell)]"
      style={{ width: "var(--width-context)", background: "var(--bg-rail)" }}
    >
      {/* Mobile header */}
      {onClose && (
        <div className="p-4 flex items-center justify-between md:hidden border-b border-[var(--border-shell)]">
          <p className="text-sm font-medium">Contexte</p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)]">
            ✕
          </button>
        </div>
      )}

      {/* Run halo — symétrique au bloc logo de gauche, fixe, jamais scrollé */}
      <div className="shrink-0 border-b border-[var(--border-shell)] flex items-center justify-center pt-5 pb-4 px-2">
        <RunHaloIndicator />
      </div>

      {/* ① STATUS — toujours rendu */}
      <div className="px-4 py-4 border-b border-[var(--border-shell)]">
        <div className="flex items-center justify-between mb-3">
          <span className="t-11 font-mono tracking-[0.22em] text-[var(--text-placeholder)] uppercase">
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

        {/* ② FOCAL — toujours rendu, Related fusionné en sous-bloc */}
        <div className="px-4 py-4 border-b border-[var(--border-shell)] relative">
          <div className="flex items-center justify-between mb-4">
            <div className={`flex items-center gap-2 ${focalObject ? "text-[var(--cykan)] halo-cyan-sm" : "text-[var(--text-faint)]"}`}>
              <FileIcon />
              <span className="t-11 font-mono tracking-[0.22em] uppercase">
                {focalObject ? focalObjectType : "Focal"}
              </span>
            </div>
          </div>

          {focalObject ? (
            <>
              <h3 className="t-15 font-medium text-[var(--text)] mb-1 leading-snug">{focalTitle}</h3>

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
                  {actionLoading ? "Traitement…" : (focalObject as FocalObjectView).primaryAction?.label}
                </button>
              )}
            </>
          ) : (
            <EmptyState>Aucun focal actif</EmptyState>
          )}

          {secondaryObjects.length > 0 && (
            <div className="mt-5 pt-4 border-t border-[var(--border-shell)]">
              <div className="flex items-center gap-2 mb-3 text-[var(--text-faint)]">
                <NodeIcon />
                <span className="t-11 font-mono tracking-[0.22em] uppercase">Related</span>
              </div>
              <div className="space-y-1 overflow-y-auto scrollbar-hide" style={{ maxHeight: "var(--space-24)" }}>
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
        </div>

        {/* ③ ACTIVITY — toujours rendu, Run details fusionné en sous-bloc */}
        <div className="px-4 py-4 border-b border-[var(--border-shell)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-[var(--text-faint)]">
              <ActivityIcon />
              <span className="t-11 font-mono tracking-[0.22em] uppercase">Activity</span>
            </div>
            {isRunning && (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--cykan)] animate-pulse halo-dot" />
            )}
          </div>

          {activityEvents.length > 0 ? (
            <div className="space-y-1 overflow-y-auto scrollbar-hide" style={{ maxHeight: "var(--space-32)" }}>
              {activityEvents.map((event, i) => (
                <div
                  key={`${event.type}-${event.timestamp}-${i}`}
                  className={`flex items-start gap-2.5 py-1.5 ${i === 0 && isRunning ? "opacity-100" : "opacity-60"}`}
                >
                  <span className={`t-9 font-mono shrink-0 mt-0.5 ${
                    event.type === "tool_call_started" ? "text-[var(--cykan)]" :
                    event.type === "tool_call_completed" ? "text-[var(--color-success)]" :
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
          ) : (
            <EmptyState>{isRunning ? "En attente…" : "Aucune activité"}</EmptyState>
          )}

          {panelData?.currentRun && (
            <div className="mt-5 pt-4 border-t border-[var(--border-shell)] space-y-3 t-11">
              <div className="flex justify-between">
                <span className="font-mono tracking-[0.2em] text-[var(--text-faint)] uppercase">Run ID</span>
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
          )}
        </div>

        {/* ④ ASSETS — toujours rendu */}
        <div className="px-4 py-4 border-b border-[var(--border-shell)]">
          <button
            onClick={() => router.push("/assets")}
            className="halo-on-hover w-full flex items-center justify-between mb-5 group/header text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors"
            title="View all assets"
          >
            <span className="flex items-center gap-2">
              <DatabaseIcon />
              <span className="t-11 font-mono tracking-[0.22em] uppercase">Assets</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="t-9 font-mono tracking-[0.2em]">{assets.length}</span>
              <span className="t-9 font-mono opacity-0 group-hover/header:opacity-100 -translate-x-1 group-hover/header:translate-x-0 transition-all">→</span>
            </span>
          </button>

          {assets.length > 0 ? (
            <div className="space-y-px overflow-y-auto scrollbar-hide" style={{ maxHeight: "var(--space-32)" }}>
              {assets.slice(0, 5).map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => useFocalStore.getState().setFocal(assetToFocal(asset, activeThreadId))}
                  className="group cursor-pointer py-2 -mx-2 px-2 hover:bg-[var(--surface-1)] transition-colors border-b border-[var(--border-soft)] last:border-b-0 flex items-start gap-3"
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
                      if (!window.confirm(`Supprimer "${asset.name}" ?`)) return;

                      const previous = panelData?.assets ?? [];
                      setData((prev) => prev ? { ...prev, assets: prev.assets.filter((a) => a.id !== asset.id) } : prev);

                      try {
                        const res = await fetch(`/api/v2/assets/${encodeURIComponent(asset.id)}`, { method: "DELETE" });
                        if (!res.ok) {
                          const body = (await res.json().catch(() => ({}))) as { error?: string };
                          throw new Error(body.error ?? `HTTP ${res.status}`);
                        }
                        toast.success("Asset supprimé", asset.name);
                      } catch (err) {
                        setData((prev) => prev ? { ...prev, assets: previous } : prev);
                        const msg = err instanceof Error ? err.message : "Erreur inconnue";
                        toast.error("Suppression impossible", msg);
                      }
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
          ) : (
            <EmptyState>{loading ? "Chargement…" : "Aucun asset généré"}</EmptyState>
          )}
        </div>

        {/* ⑤ MISSIONS — toujours rendu */}
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-3 text-[var(--text-faint)]">
            <button
              onClick={() => router.push("/missions")}
              className="flex items-center gap-2 hover:text-[var(--cykan)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--cykan-border-hover)] transition-colors"
              title="View all missions"
            >
              <MissionIcon />
              <span className="t-11 font-mono tracking-[0.22em] uppercase">Missions</span>
            </button>
            <div className="flex items-center gap-3">
              <span className="t-9 font-mono tracking-[0.2em]">{missions.length}</span>
              <button
                onClick={() => router.push("/missions?new=1")}
                title="Nouvelle mission"
                className="t-13 leading-none text-[var(--text-faint)] hover:text-[var(--cykan)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--cykan-border-hover)] transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {missions.length > 0 ? (
            <div className="space-y-px mb-3 overflow-y-auto scrollbar-hide" style={{ maxHeight: "var(--space-32)" }}>
              {missions.slice(0, 3).map((mission) => (
                <div
                  key={mission.id}
                  onClick={() => useFocalStore.getState().setFocal(missionToFocal(mission, activeThreadId))}
                  className="group cursor-pointer py-2 -mx-2 px-2 hover:bg-[var(--surface-1)] transition-colors border-b border-[var(--border-soft)] last:border-b-0 flex items-center gap-3"
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
          ) : (
            <EmptyState>{loading ? "Chargement…" : "Aucune mission armée"}</EmptyState>
          )}
        </div>
      </div>
    </aside>
  );
}
