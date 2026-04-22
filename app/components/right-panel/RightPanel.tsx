"use client";

/**
 * Right Panel — 2-state machine: INDEX / DOCUMENT.
 *
 * INDEX sections (top → bottom):
 *   1. KPIs bar (agents, missions, objets actifs)
 *   2. Missions (en cours / validées / draft — play/pause/stop)
 *   3. Historique (timeline with service icons)
 *   4. Assets & Services (fichiers + logos services)
 *
 * DOCUMENT: full object in the rail, except when the **focal** is
 * `ready` or `awaiting_approval` — then `FocalObjectRenderer` mounts in
 * `ManifestationStage` (center) while this rail keeps INDEX (missions/assets).
 *
 * `RightPanelDocumentProvider` wraps `{children}` + this rail in the user layout
 * so `useRightPanelDocument()` can read the same state on `/`.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useRightPanel } from "@/app/hooks/use-right-panel";
import { useRunStreamOptional } from "@/app/lib/run-stream-context";
import { useFocalObject } from "@/app/hooks/use-focal-object";
import { useOrchestrate } from "@/app/hooks/use-orchestrate";
import { useSidebarOptional } from "@/app/hooks/use-sidebar";
import { resolveConversationId } from "@/app/lib/thread-memory";
import { useHaloRuntime } from "@/app/lib/halo-runtime-context";
import type { FocalObject, FocalAction } from "@/lib/right-panel/objects";
import type { RightPanelMission, RightPanelAsset } from "@/lib/ui/right-panel/types";
import { FocalObjectRenderer } from "./FocalObjectRenderer";

type PanelState = "INDEX" | "DOCUMENT";

export type RightPanelDocumentContextValue = {
  focalDocumentInCenter: boolean;
  documentObject: FocalObject | null;
  panelState: PanelState;
  closeDocument: () => void;
  navigateDocument: (obj: FocalObject) => void;
  handleFocalAction: (action: FocalAction) => Promise<void>;
  isPending: boolean;
  allObjects: FocalObject[];
  currentDocIndex: number;
  hasPrev: boolean;
  hasNext: boolean;
  streamConnected: boolean;
  focal: FocalObject | null;
  haloCoreState: string;
  missions: RightPanelMission[];
  assets: RightPanelAsset[];
  openDocument: (obj: FocalObject) => void;
};

const RightPanelDocumentContext = createContext<RightPanelDocumentContextValue | null>(null);

export function useRightPanelDocument(): RightPanelDocumentContextValue {
  const v = useContext(RightPanelDocumentContext);
  if (!v) {
    throw new Error("useRightPanelDocument must be used within RightPanelDocumentProvider");
  }
  return v;
}

const DEMO_MISSIONS: RightPanelMission[] = [
  { id: "demo-1", name: "Veille concurrentielle", input: "Surveiller les signaux concurrentiels et produire une synthèse exploitable", schedule: "every day", enabled: true, opsStatus: "running" },
  { id: "demo-2", name: "Résumé emails du matin", input: "Analyser les emails entrants et remonter les éléments significatifs", schedule: "every day", enabled: true, opsStatus: "success" },
  { id: "demo-3", name: "Rapport hebdo KPIs", input: "Agréger les métriques clés et générer un point de situation clair", schedule: "every week", enabled: true, opsStatus: "idle" },
  { id: "demo-4", name: "Alertes mentions presse", input: "Observer les mentions presse et préparer un résumé décisionnel", schedule: "every hour", enabled: false, opsStatus: "idle" },
];

function ServiceIcon({ text }: { text: string }) {
  const t = text.toLowerCase();
  const cls = "w-4 h-4 shrink-0";

  if (t.includes("mail") || t.includes("gmail") || t.includes("email")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/40" /><path d="M1.5 4l6.5 5 6.5-5" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/40" /></svg>
  );
  if (t.includes("whatsapp") || t.includes("wa")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none"><path d="M8 1.5a6.5 6.5 0 00-5.6 9.8L1.5 14.5l3.3-.9A6.5 6.5 0 108 1.5z" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/40" /><path d="M5.5 6.5c.2-.8.6-1 1-1s.7.3.9.8l.2.6c.1.2 0 .5-.2.6l-.4.3c.3.7.8 1.2 1.5 1.5l.3-.4c.1-.2.4-.3.6-.2l.6.2c.5.2.8.5.8.9s-.2.8-1 1c-.8.2-2-.2-3-1.2s-1.4-2.2-1.2-3z" fill="currentColor" className="text-cyan-accent/40" /></svg>
  );
  if (t.includes("slack")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none"><rect x="6" y="1" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/40" /><rect x="1" y="6" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/40" /><rect x="6" y="9" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/40" /><rect x="9" y="6" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/40" /></svg>
  );
  if (t.includes("notion")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/40" /><path d="M5.5 5h5M5.5 7.5h5M5.5 10h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className="text-cyan-accent/40" /></svg>
  );
  if (t.includes("calendar") || t.includes("agenda") || t.includes("planif")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/40" /><path d="M2 6.5h12" stroke="currentColor" strokeWidth="1" className="text-cyan-accent/40" /><path d="M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-cyan-accent/40" /></svg>
  );
  if (t.includes("drive") || t.includes("doc") || t.includes("fichier")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none"><path d="M4 2h5l4 4v8a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 14V3.5A1.5 1.5 0 014 2z" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/40" /><path d="M9 2v4h4" stroke="currentColor" strokeWidth="1" className="text-cyan-accent/40" /></svg>
  );
  if (t.includes("synth") || t.includes("report") || t.includes("brief") || t.includes("résumé")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/40" /><path d="M5 5h6M5 8h4M5 11h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className="text-cyan-accent/40" /></svg>
  );
  if (t.includes("action") || t.includes("task") || t.includes("mission")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/40" /><path d="M5.5 8l2 2 3.5-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-accent/40" /></svg>
  );

  return (
    <svg className={cls} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" fill="currentColor" className="text-cyan-accent/35" /></svg>
  );
}

function missionToFocalObject(mission: RightPanelMission): import("@/lib/right-panel/objects").FocalObject {
  const now = Date.now();
  const isRunning = mission.opsStatus === "running";
  return {
    objectType: "mission_active",
    id: `fo_mission_${mission.id}`,
    threadId: "",
    title: mission.name,
    status: isRunning ? "active" : mission.enabled ? "active" : "paused",
    createdAt: mission.lastRunAt ?? now,
    updatedAt: mission.lastRunAt ?? now,
    morphTarget: null,
    intent: mission.input || mission.name,
    schedule: mission.schedule,
    lastRunAt: mission.lastRunAt,
    runCount: 0,
    primaryAction: mission.enabled
      ? { kind: "pause", label: "Pause" }
      : { kind: "resume", label: "Reprendre" },
  };
}

function MissionRow({ mission, onInspect }: { mission: RightPanelMission; onInspect: () => void }) {
  const isRunning = mission.opsStatus === "running";

  return (
    <button
      onClick={onInspect}
      className="ghost-rail-row group"
    >
      <ServiceIcon text={mission.name} />
      <span className={`min-w-0 flex-1 truncate text-[13px] transition-colors ${isRunning ? "text-white/84" : "text-white/66 group-hover:text-white/82"}`}>
        {mission.name}
      </span>
      <span className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] ${isRunning ? "text-cyan-accent/52" : "text-white/34"}`}>
        {isRunning ? "en cours" : mission.enabled ? "actif" : "inactif"}
      </span>
    </button>
  );
}

function useRightPanelDocumentMachine(): RightPanelDocumentContextValue {
  const { data } = useRightPanel();
  const stream = useRunStreamOptional();
  const connected = stream?.connected ?? false;
  const { focal, secondary } = useFocalObject();
  const v2 = useOrchestrate();
  const sidebarCtx = useSidebarOptional();
  const { state: halo } = useHaloRuntime();

  const missions = useMemo(() => {
    const raw = data.missions ?? [];
    return raw.length > 0 ? raw : DEMO_MISSIONS;
  }, [data.missions]);

  const assets = useMemo(() => data.assets ?? [], [data.assets]);

  const [panelState, setPanelState] = useState<PanelState>("INDEX");
  const [documentObject, setDocumentObject] = useState<FocalObject | null>(null);
  const [isPending, setIsPending] = useState(false);
  const actionLockRef = useRef(false);
  const prevThreadIdRef = useRef(sidebarCtx?.state.activeThreadId);
  const dismissedFocalIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (sidebarCtx?.state.activeThreadId === prevThreadIdRef.current) return;
    prevThreadIdRef.current = sidebarCtx?.state.activeThreadId;
    dismissedFocalIdRef.current = null;
    setPanelState("INDEX");
    setDocumentObject(null);
  }, [sidebarCtx?.state.activeThreadId]);

  const openDocument = useCallback((obj: FocalObject) => {
    setDocumentObject(obj);
    setPanelState("DOCUMENT");
  }, []);

  const closeDocument = useCallback(() => {
    if (documentObject) {
      dismissedFocalIdRef.current = documentObject.id;
    }
    setPanelState("INDEX");
    setDocumentObject(null);
  }, [documentObject]);

  useEffect(() => {
    if (panelState !== "DOCUMENT") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDocument();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [panelState, closeDocument]);

  useEffect(() => {
    if (!focal) return;

    if (focal.id !== dismissedFocalIdRef.current && dismissedFocalIdRef.current !== null) {
      dismissedFocalIdRef.current = null;
    }

    if (
      (focal.status === "ready" || focal.status === "awaiting_approval") &&
      panelState === "INDEX" &&
      focal.id !== dismissedFocalIdRef.current
    ) {
      openDocument(focal);
    }
  }, [focal, panelState, openDocument]);

  const allObjects = useMemo(
    () => (focal ? [focal, ...secondary] : secondary),
    [focal, secondary],
  );

  const navigateDocument = useCallback((obj: FocalObject) => {
    setDocumentObject(obj);
  }, []);

  const currentDocIndex = documentObject
    ? allObjects.findIndex((o) => o.id === documentObject.id)
    : -1;
  const hasPrev = currentDocIndex > 0;
  const hasNext = currentDocIndex >= 0 && currentDocIndex < allObjects.length - 1;

  const handleFocalAction = useCallback(async (action: FocalAction) => {
    const target = documentObject ?? focal;
    if (!target || actionLockRef.current) return;

    actionLockRef.current = true;
    setIsPending(true);
    try {
      const actionIntent = `[action:${action.kind}] Exécute l'action "${action.kind}" sur l'objet "${target.title}" (type: ${target.objectType}, statut: ${target.status})`;
      const focalCtx = {
        id: target.id,
        objectType: target.objectType,
        title: target.title,
        status: target.status,
      };
      const threadId = sidebarCtx?.state.activeThreadId;
      const convId = resolveConversationId(threadId);

      await v2.send(actionIntent, "home", convId, focalCtx, threadId ?? undefined);
    } finally {
      setIsPending(false);
      actionLockRef.current = false;
    }
  }, [documentObject, focal, v2, sidebarCtx?.state.activeThreadId]);

  const isDocument = panelState === "DOCUMENT" && documentObject !== null;
  const focalDocumentInCenter =
    isDocument &&
    focal != null &&
    (focal.status === "ready" || focal.status === "awaiting_approval");

  return useMemo(
    (): RightPanelDocumentContextValue => ({
      focalDocumentInCenter,
      documentObject,
      panelState,
      closeDocument,
      navigateDocument,
      handleFocalAction,
      isPending,
      allObjects,
      currentDocIndex,
      hasPrev,
      hasNext,
      streamConnected: connected,
      focal,
      haloCoreState: halo.coreState,
      missions,
      assets,
      openDocument,
    }),
    [
      focalDocumentInCenter,
      documentObject,
      panelState,
      closeDocument,
      navigateDocument,
      handleFocalAction,
      isPending,
      allObjects,
      currentDocIndex,
      hasPrev,
      hasNext,
      connected,
      focal,
      halo.coreState,
      missions,
      assets,
      openDocument,
    ],
  );
}

export function RightPanelDocumentProvider({ children }: { children: ReactNode }) {
  const value = useRightPanelDocumentMachine();
  return (
    <RightPanelDocumentContext.Provider value={value}>
      {children}
    </RightPanelDocumentContext.Provider>
  );
}

function IndexSections({
  focal,
  haloCoreState,
  missions,
  assets,
  openDocument,
}: Pick<RightPanelDocumentContextValue, "focal" | "haloCoreState" | "missions" | "assets" | "openDocument">) {
  return (
    <div className="compact-right-panel-body flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto scrollbar-hide px-5 py-5">
      <section className="ghost-rail-section">
        <p className="ghost-kicker">System</p>
        <div className="mt-3 text-[14px] leading-7 text-white/68">
          {focal?.status === "ready"
            ? "active"
            : haloCoreState !== "idle"
            ? "thinking"
            : "idle"}{" "}
          · {missions?.length ?? 0} missions
        </div>
      </section>

      <section className="ghost-rail-section mt-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="ghost-kicker">Missions</p>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/32">
            {(missions ?? []).slice(0, 4).length}
          </span>
        </div>

        <div className="min-w-0 space-y-1.5">
          {(missions ?? []).slice(0, 4).map((mission) => (
            <MissionRow
              key={mission.id}
              mission={mission}
              onInspect={() => openDocument(missionToFocalObject(mission))}
            />
          ))}
        </div>
      </section>

      <section className="ghost-rail-section mt-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="ghost-kicker">Assets</p>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/32">
            {(assets ?? []).slice(0, 6).length}
          </span>
        </div>

        <div className="flex min-w-0 flex-wrap gap-2">
          {(assets ?? []).slice(0, 6).map((asset: RightPanelAsset) => (
            <div
              key={asset.id}
              className="max-w-full rounded-full border border-white/8 bg-white/2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/62 bounded-anywhere"
            >
              {asset.type}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function RightPanelRail() {
  const ctx = useRightPanelDocument();
  const {
    focalDocumentInCenter,
    documentObject,
    panelState,
    closeDocument,
    navigateDocument,
    handleFocalAction,
    isPending,
    allObjects,
    currentDocIndex,
    hasPrev,
    hasNext,
    streamConnected,
    focal,
    haloCoreState,
    missions,
    assets,
    openDocument,
  } = ctx;

  const isDocument = panelState === "DOCUMENT" && documentObject !== null;
  const showRendererInRail = isDocument && !focalDocumentInCenter;
  const railShowsIndexBody = !isDocument || focalDocumentInCenter;

  return (
    <div
      role="complementary"
      aria-label="Object rail"
      className="compact-shell-right-rail right-panel-width relative hidden h-full shrink-0 flex-col overflow-hidden border-l border-white/6 bg-background lg:flex"
      style={{ contain: "strict" }}
    >
      <div className="compact-right-panel-header z-20 flex h-[76px] shrink-0 items-center border-b border-white/6 px-6">
        {showRendererInRail && (
          <button
            type="button"
            onClick={closeDocument}
            className="rounded-full border border-white/8 px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] text-white/50 transition-colors duration-200 hover:border-white/16 hover:text-white"
          >
            ← INDEX
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          {(!isDocument || focalDocumentInCenter) && (
            <div className="text-right">
              <p className="ghost-kicker">Object rail</p>
              <p className="mt-1 text-[12px] text-white/44">
                {focal?.status === "ready" ? "ready" : haloCoreState !== "idle" ? "thinking" : "idle"}
              </p>
            </div>
          )}
          {showRendererInRail && documentObject && (
            <div className="text-right">
              <p className="ghost-kicker">Manifestation</p>
              <p className="mt-1 max-w-60 truncate text-[13px] text-white/72">
                {documentObject.title}
              </p>
            </div>
          )}
          <span
            className={`transition-all duration-500 ${
              streamConnected ? "status-dot" : "h-[5px] w-[5px] rounded-full bg-white/10"
            }`}
          />
        </div>
      </div>

      {showRendererInRail && documentObject && (
        <div className="compact-right-panel-body min-h-0 flex-1 overflow-y-auto scrollbar-hide px-6 pb-8 pt-6">
          <div className="mb-5">
            <p className="ghost-kicker">Manifestation</p>
          </div>
          <FocalObjectRenderer
            object={documentObject}
            onAction={handleFocalAction}
            isPending={isPending}
            mode="full"
            surface="rail"
          />

          {allObjects.length > 1 && (
            <div className="mt-8 flex items-center justify-between border-t border-white/6 pt-5 text-sm text-white/50">
              <button
                type="button"
                onClick={() => hasPrev && navigateDocument(allObjects[currentDocIndex - 1])}
                disabled={!hasPrev}
                className="rounded-full border border-white/8 px-3 py-1.5 font-mono text-[11px] tracking-[0.16em] transition-colors duration-200 hover:border-white/16 hover:text-white disabled:cursor-default disabled:opacity-20"
              >
                ← Précédent
              </button>
              <button
                type="button"
                onClick={() => hasNext && navigateDocument(allObjects[currentDocIndex + 1])}
                disabled={!hasNext}
                className="rounded-full border border-white/8 px-3 py-1.5 font-mono text-[11px] tracking-[0.16em] transition-colors duration-200 hover:border-white/16 hover:text-white disabled:cursor-default disabled:opacity-20"
              >
                Suivant →
              </button>
            </div>
          )}
        </div>
      )}

      {railShowsIndexBody && (
        <IndexSections
          focal={focal}
          haloCoreState={haloCoreState}
          missions={missions}
          assets={assets}
          openDocument={openDocument}
        />
      )}
    </div>
  );
}

const RightPanel = memo(RightPanelRail);
export default RightPanel;
