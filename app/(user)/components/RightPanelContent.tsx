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
// RunHaloIndicator (grille 5×20 cellules) supprimé du header — illisible
// et redondant avec la section STATUS juste en dessous. Le fichier
// RunHaloIndicator.tsx reste sur disque pour réintroduction éventuelle.
import {
  FileIcon,
  MissionIcon,
  NodeIcon,
  DatabaseIcon,
  ChevronIcon,
} from "./right-panel-icons";
import {
  formatRelativeTime,
  AssetGlyphSVG,
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

  // État ouvert/fermé de chaque section. Persisté en localStorage pour
  // conserver les préférences entre rechargements et changements de thread.
  const SECTIONS_STORAGE_KEY = "hearst.rightpanel.openSections";
  type SectionKey = "focal" | "assets" | "missions";
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    focal: true,
    assets: true,
    missions: true,
  });
  // Hydrate depuis localStorage au mount (évite tout mismatch SSR).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SECTIONS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<SectionKey, boolean>>;
        setOpenSections((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      /* localStorage indisponible ou JSON corrompu — ignore */
    }
  }, []);
  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

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
    // Effacer l'ancienne data immédiatement au changement de thread — évite que
    // les assets/missions du thread précédent restent visibles pendant la transition.
    setData(null);

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

  const assetAccent = (type: string) => {
    const t = type.toLowerCase();
    if (t === "brief") return "var(--cykan)";
    if (t === "report" || t === "document") return "var(--text-muted)";
    if (t === "synthesis") return "var(--warn)";
    if (t === "plan") return "var(--color-success)";
    return "var(--text-faint)";
  };

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

      {/* Scrollable content — Focal en premier, deliverable prioritaire */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">

        {/* ② FOCAL */}
        {/* ② FOCAL — collapsible, hauteur fixe quand ouvert */}
        <div className="border-b border-[var(--border-shell)] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection("focal")}
            className="w-full flex items-center gap-2 px-4 py-3 text-[var(--text-soft)] hover:bg-[var(--surface-1)] transition-colors"
          >
            <ChevronIcon open={openSections.focal} />
            <FileIcon />
            <span className="t-9 font-mono tracking-[0.22em] font-semibold uppercase">Focal</span>
            <span className="ml-auto t-9 font-mono text-[var(--text-faint)]">{focalObject ? "1" : "—"}</span>
          </button>

          <div
            className="overflow-hidden transition-all"
            style={{ height: openSections.focal ? "var(--space-32)" : "0px", padding: openSections.focal ? "0 var(--space-4) var(--space-3)" : "0 var(--space-4)" }}
          >
          <div className="overflow-y-auto scrollbar-hide h-full flex flex-col gap-3">
            {focalObject ? (
              <div
                className="rounded-sm overflow-hidden shrink-0"
                style={{ background: "var(--cykan-bg-hover)", borderLeft: "3px solid var(--cykan)" }}
              >
                <div className="px-3 pt-2 pb-1 flex items-center gap-2">
                  <span
                    className="t-9 font-mono tracking-[0.22em] uppercase font-semibold"
                    style={{ color: "var(--cykan)" }}
                  >
                    {focalObjectType}
                  </span>
                </div>
                <div className="px-3 pb-3">
                  <h3 className="t-13 font-medium text-[var(--text)] leading-snug mb-3">{focalTitle}</h3>

                  {actionError && (
                    <p className="mb-3 t-11 text-[var(--danger)] bg-[var(--danger)]/10 px-2 py-1.5 rounded-sm">{actionError}</p>
                  )}

                  {(focalObject as FocalObjectView)?.primaryAction && (
                    <button
                      className={`w-full py-2.5 t-11 font-mono tracking-[0.18em] uppercase rounded-sm transition-colors ${
                        (focalObject as FocalObjectView).primaryAction?.kind === "approve"
                          ? "bg-[var(--text)] text-[var(--bg)] hover:opacity-90"
                          : "bg-[var(--cykan)] text-[var(--bg)] hover:opacity-90"
                      }`}
                      onClick={handlePrimaryAction}
                      disabled={actionLoading}
                    >
                      {actionLoading ? "Traitement…" : (focalObject as FocalObjectView).primaryAction?.label}
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            {secondaryObjects.length > 0 && (
              <div className="shrink-0 pt-2 border-t border-[var(--border-shell)]">
                <div className="flex items-center gap-2 mb-1.5 text-[var(--text-faint)]">
                  <NodeIcon />
                  <span className="t-9 font-mono tracking-[0.22em] uppercase">Liés</span>
                </div>
                <div className="space-y-px">
                  {secondaryObjects.map((obj, idx) => {
                    const objType = getFocalProp(obj, "objectType") || "unknown";
                    const objTitle = getFocalProp(obj, "title") || "Untitled";
                    const objStatus = getFocalProp(obj, "status") || "";
                    return (
                      <div key={idx} className="flex items-center gap-2 group cursor-pointer py-1.5 -mx-1 px-1 hover:bg-[var(--surface-2)] rounded-sm transition-colors">
                        {objStatus && (
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            objStatus === "ready" ? "bg-[var(--cykan)]" :
                            objStatus === "awaiting_approval" ? "bg-[var(--warn)]" :
                            "bg-[var(--text-ghost)]"
                          }`} />
                        )}
                        <p className="t-11 text-[var(--text-soft)] group-hover:text-[var(--text)] transition-colors truncate flex-1">{objTitle}</p>
                        <span className="t-9 font-mono tracking-[0.16em] text-[var(--text-faint)] uppercase shrink-0">{objType}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          </div>
        </div>

        {/* ACTIVITÉ supprimée — redondante avec le chat (transcript). Historique
            préservé en backend silencieux (RuntimeStore.events). */}

        {/* ③ ASSETS — collapsible */}
        <div className="border-b border-[var(--border-shell)] overflow-hidden">
          <div className="w-full flex items-center gap-2 px-4 py-3 text-[var(--text-soft)] hover:bg-[var(--surface-1)] transition-colors">
            <button
              type="button"
              onClick={() => toggleSection("assets")}
              className="flex items-center gap-2 flex-1 text-left"
            >
              <ChevronIcon open={openSections.assets} />
              <DatabaseIcon />
              <span className="t-9 font-mono tracking-[0.22em] font-semibold uppercase">Assets</span>
            </button>
            <button
              type="button"
              onClick={() => router.push("/assets")}
              className="t-9 font-mono text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors"
              title="Voir tous les assets"
            >
              {assets.length > 0 ? `${assets.length} →` : "→"}
            </button>
          </div>

          <div
            className="overflow-hidden transition-all"
            style={{ height: openSections.assets ? "auto" : "0px", padding: openSections.assets ? "0 var(--space-4) var(--space-3)" : "0 var(--space-4)" }}
          >
          <div className="overflow-y-auto scrollbar-hide space-y-2" style={{ height: "var(--space-32)" }}>
            {assets.length > 0 ? (
              assets.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => useFocalStore.getState().setFocal(assetToFocal(asset, activeThreadId))}
                  className="group cursor-pointer flex items-center gap-2.5 rounded-sm px-2.5 py-2 hover:bg-[var(--surface-2)] transition-colors"
                  style={{
                    background: "var(--surface-1)",
                    borderLeft: `3px solid ${assetAccent(asset.type)}`,
                  }}
                  title={asset.name}
                >
                  <div
                    className="w-7 h-7 flex items-center justify-center shrink-0 rounded-sm"
                    style={{ background: "var(--surface-2)", color: assetAccent(asset.type) }}
                    aria-hidden
                  >
                    <span className="w-4 h-4 block">
                      <AssetGlyphSVG type={asset.type} />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="t-12 font-medium text-[var(--text-soft)] group-hover:text-[var(--text)] transition-colors truncate leading-snug">{asset.name}</p>
                    <p
                      className="t-9 font-mono tracking-[0.16em] uppercase mt-0.5"
                      style={{ color: assetAccent(asset.type) }}
                    >
                      {asset.type}
                    </p>
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
                        toast.error("Suppression impossible", err instanceof Error ? err.message : "Erreur inconnue");
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-[var(--text-ghost)] hover:text-[var(--danger)] transition-all shrink-0 rounded-sm"
                    title="Supprimer"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              ))
            ) : (
              <div className="flex items-center h-full">
                <EmptyState>{loading ? "Chargement…" : "Aucun asset généré"}</EmptyState>
              </div>
            )}
          </div>
          </div>
        </div>

        {/* ⑤ MISSIONS — collapsible */}
        <div className="overflow-hidden">
          <div className="w-full flex items-center gap-2 px-4 py-3 text-[var(--text-soft)] hover:bg-[var(--surface-1)] transition-colors">
            <button
              type="button"
              onClick={() => toggleSection("missions")}
              className="flex items-center gap-2 flex-1 text-left"
            >
              <ChevronIcon open={openSections.missions} />
              <MissionIcon />
              <span className="t-9 font-mono tracking-[0.22em] font-semibold uppercase">Missions</span>
            </button>
            <span className="t-9 font-mono text-[var(--text-faint)]">{missions.length}</span>
            <button
              type="button"
              onClick={() => router.push("/missions?new=1")}
              title="Nouvelle mission"
              className="t-13 w-5 h-5 flex items-center justify-center rounded-sm text-[var(--text-faint)] hover:text-[var(--cykan)] hover:bg-[var(--cykan-bg-hover)] transition-colors"
            >
              +
            </button>
          </div>

          <div
            className="overflow-hidden transition-all"
            style={{ height: openSections.missions ? "auto" : "0px", padding: openSections.missions ? "0 var(--space-4) var(--space-3)" : "0 var(--space-4)" }}
          >
          <div className="overflow-y-auto scrollbar-hide space-y-2" style={{ height: "var(--space-24)" }}>
            {missions.length > 0 ? (
              missions.map((mission) => {
                const isRunningMission = mission.opsStatus === "running";
                const isFailed = mission.opsStatus === "failed";
                const isArmed = mission.enabled && !isRunningMission && !isFailed;
                return (
                  <div
                    key={mission.id}
                    onClick={() => useFocalStore.getState().setFocal(missionToFocal(mission, activeThreadId))}
                    className="group cursor-pointer flex items-center gap-2.5 px-2.5 py-2 rounded-sm hover:bg-[var(--surface-2)] transition-colors"
                    style={{ background: "var(--surface-1)" }}
                  >
                    {/* Ring SVG 20px */}
                    <svg width="20" height="20" viewBox="0 0 20 20" className="shrink-0">
                      <circle cx="10" cy="10" r="8" fill="none" stroke="var(--border-default)" strokeWidth="1.5" />
                      {isRunningMission && (
                        <circle
                          cx="10" cy="10" r="8"
                          fill="none"
                          stroke="var(--cykan)"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeDasharray="35 50"
                          transform="rotate(-90 10 10)"
                          style={{ filter: "drop-shadow(0 0 3px var(--cykan))" }}
                        />
                      )}
                      {isArmed && (
                        <circle
                          cx="10" cy="10" r="8"
                          fill="none"
                          stroke="var(--cykan)"
                          strokeWidth="1.5"
                          opacity="0.35"
                          strokeDasharray="50 0"
                          transform="rotate(-90 10 10)"
                        />
                      )}
                      {isFailed && (
                        <circle
                          cx="10" cy="10" r="8"
                          fill="none"
                          stroke="var(--danger)"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeDasharray="12 50"
                          transform="rotate(-90 10 10)"
                        />
                      )}
                      {!mission.enabled && !isFailed && (
                        <circle cx="10" cy="10" r="2.5" fill="var(--text-ghost)" />
                      )}
                      {isRunningMission && (
                        <circle cx="10" cy="10" r="2.5" fill="var(--cykan)" />
                      )}
                    </svg>

                    <div className="flex-1 min-w-0">
                      <p className="t-12 font-medium text-[var(--text-soft)] group-hover:text-[var(--text)] transition-colors truncate">{mission.name}</p>
                      <p className="t-9 font-mono tracking-[0.14em] uppercase mt-0.5" style={{
                        color: isRunningMission ? "var(--cykan)" : isFailed ? "var(--danger)" : "var(--text-faint)"
                      }}>
                        {isRunningMission ? "running" : isFailed ? "échec" : isArmed ? "armé" : "off"}
                        {mission.lastRunAt ? ` · ${formatRelativeTime(mission.lastRunAt)}` : ""}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex items-center h-full">
                <EmptyState>{loading ? "Chargement…" : "Aucune mission armée"}</EmptyState>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* STATUS — footer compact, toujours visible. Référence d'état d'arrière-plan,
          pas focus principal. Une seule ligne : pill état + flow label. */}
      <div className="shrink-0 border-t border-[var(--border-shell)] px-4 py-2.5 flex items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 t-9 font-mono tracking-[0.16em] uppercase px-2 py-0.5 rounded-sm shrink-0 ${
          coreState === "awaiting_approval"
            ? "bg-[var(--warn)]/10 text-[var(--warn)]"
            : isRunning
            ? "bg-[var(--cykan)]/10 text-[var(--cykan)]"
            : "text-[var(--text-faint)]"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            coreState === "awaiting_approval" ? "bg-[var(--warn)]" :
            isRunning ? "bg-[var(--cykan)] animate-pulse" : "bg-[var(--text-ghost)]"
          }`} />
          {!hasActiveThread ? "standby" : isConnected ? "live" : "offline"}
        </span>
        <p className="t-11 text-[var(--text-muted)] truncate flex-1" title={stateLabel}>{stateLabel}</p>
        {isRunning && (
          <div className="w-12 h-0.5 rounded-full overflow-hidden shrink-0" style={{ background: "var(--border-soft)" }}>
            <div
              className={`h-full rounded-full transition-all duration-500 ${coreState === "awaiting_approval" ? "bg-[var(--warn)]" : "bg-[var(--cykan)]"}`}
              style={{ width: coreState === "awaiting_approval" ? "100%" : "66%" }}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
