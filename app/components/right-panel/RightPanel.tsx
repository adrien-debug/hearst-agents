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
 * DOCUMENT: full object deployed in-place.
 */

import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useRightPanel } from "@/app/hooks/use-right-panel";
import { useRunStreamOptional } from "@/app/lib/run-stream-context";
import { useFocalObject } from "@/app/hooks/use-focal-object";
import { useOrchestrate } from "@/app/hooks/use-orchestrate";
import { useSidebarOptional } from "@/app/hooks/use-sidebar";
import { resolveConversationId } from "@/app/lib/thread-memory";
import { useHaloRuntime } from "@/app/lib/halo-runtime-context";
import { sublineForFlow } from "@/app/lib/manifestation-stage-model";
import type { FocalObject, FocalAction } from "@/lib/right-panel/objects";
import type { RightPanelMission, RightPanelAsset } from "@/lib/ui/right-panel/types";
import { FocalObjectRenderer, TYPE_LABELS } from "./FocalObjectRenderer";

type PanelState = "INDEX" | "DOCUMENT";

const ASSET_ICON: Record<string, string> = {
  pdf: "PDF", doc: "DOC", excel: "XLS", json: "JSON",
  text: "TXT", report: "RPT", csv: "CSV",
};

const SERVICE_ICONS: { id: string; label: string }[] = [
  { id: "gmail", label: "G" },
  { id: "slack", label: "S" },
  { id: "notion", label: "N" },
  { id: "drive", label: "D" },
  { id: "calendar", label: "C" },
];

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
    <svg className={cls} viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/70" /><path d="M1.5 4l6.5 5 6.5-5" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/70" /></svg>
  );
  if (t.includes("whatsapp") || t.includes("wa")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none"><path d="M8 1.5a6.5 6.5 0 00-5.6 9.8L1.5 14.5l3.3-.9A6.5 6.5 0 108 1.5z" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/70" /><path d="M5.5 6.5c.2-.8.6-1 1-1s.7.3.9.8l.2.6c.1.2 0 .5-.2.6l-.4.3c.3.7.8 1.2 1.5 1.5l.3-.4c.1-.2.4-.3.6-.2l.6.2c.5.2.8.5.8.9s-.2.8-1 1c-.8.2-2-.2-3-1.2s-1.4-2.2-1.2-3z" fill="currentColor" className="text-cyan-accent/70" /></svg>
  );
  if (t.includes("slack")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none"><rect x="6" y="1" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/70" /><rect x="1" y="6" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/70" /><rect x="6" y="9" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/70" /><rect x="9" y="6" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/70" /></svg>
  );
  if (t.includes("notion")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/70" /><path d="M5.5 5h5M5.5 7.5h5M5.5 10h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className="text-cyan-accent/70" /></svg>
  );
  if (t.includes("calendar") || t.includes("agenda") || t.includes("planif")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/70" /><path d="M2 6.5h12" stroke="currentColor" strokeWidth="1" className="text-cyan-accent/70" /><path d="M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-cyan-accent/70" /></svg>
  );
  if (t.includes("drive") || t.includes("doc") || t.includes("fichier")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none"><path d="M4 2h5l4 4v8a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 14V3.5A1.5 1.5 0 014 2z" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/70" /><path d="M9 2v4h4" stroke="currentColor" strokeWidth="1" className="text-cyan-accent/70" /></svg>
  );
  if (t.includes("synth") || t.includes("report") || t.includes("brief") || t.includes("résumé")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/70" /><path d="M5 5h6M5 8h4M5 11h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className="text-cyan-accent/70" /></svg>
  );
  if (t.includes("action") || t.includes("task") || t.includes("mission")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" className="text-cyan-accent/70" /><path d="M5.5 8l2 2 3.5-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-accent/70" /></svg>
  );

  return (
    <svg className={cls} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" fill="currentColor" className="text-cyan-accent/60" /></svg>
  );
}

const EMOJI_RE = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
function stripEmoji(s: string): string {
  return s.replace(EMOJI_RE, "").replace(/\s{2,}/g, " ").trim();
}

const RUN_LABELS: Record<string, string> = {
  tool_call: "Appel service",
  tool_call_completed: "Service terminé",
  direct_answer: "Réponse directe",
  workflow: "Workflow",
  run_started: "Lancement",
  run_completed: "Terminé",
  run_failed: "Erreur",
  agent_selected: "Agent sélectionné",
  step_started: "Étape en cours",
  step_completed: "Étape terminée",
  asset_generated: "Asset généré",
  plan_attached: "Plan créé",
};

function ActivityIcon({ type }: { type: string }) {
  const cls = "w-4 h-4 shrink-0";
  const sc = "text-cyan-accent/70";

  if (type.includes("tool_call")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none">
      <path d="M10 2l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className={sc} />
      <path d="M6 14l-4-4 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className={sc} />
    </svg>
  );
  if (type.includes("direct_answer")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none">
      <path d="M2 3h12v8a1 1 0 01-1 1H6l-3 2.5V12H2V3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" className={sc} />
      <path d="M5 6.5h6M5 9h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className={sc} />
    </svg>
  );
  if (type.includes("workflow")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none">
      <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.2" className={sc} />
      <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.2" className={sc} />
      <circle cx="8" cy="12" r="2" stroke="currentColor" strokeWidth="1.2" className={sc} />
      <path d="M4 6v2l4 2M12 6v2l-4 2" stroke="currentColor" strokeWidth="1" className={sc} />
    </svg>
  );
  if (type.includes("completed") || type.includes("success")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" className={sc} />
      <path d="M5.5 8l2 2 3.5-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className={sc} />
    </svg>
  );
  if (type.includes("failed") || type.includes("error")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" className="text-amber-400/70" />
      <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" className="text-amber-400/70" />
    </svg>
  );
  if (type.includes("agent")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none">
      <rect x="3" y="2" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" className={sc} />
      <path d="M6 12h4M8 9v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className={sc} />
      <circle cx="6.5" cy="5.5" r="0.8" fill="currentColor" className={sc} />
      <circle cx="9.5" cy="5.5" r="0.8" fill="currentColor" className={sc} />
    </svg>
  );
  if (type.includes("asset") || type.includes("plan")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none">
      <path d="M4 2h5l4 4v8a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 14V3.5A1.5 1.5 0 014.5 2z" stroke="currentColor" strokeWidth="1.2" className={sc} />
      <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1" className={sc} />
    </svg>
  );
  if (type.includes("step")) return (
    <svg className={cls} viewBox="0 0 16 16" fill="none">
      <path d="M2 8h12M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className={sc} />
    </svg>
  );

  return (
    <svg className={cls} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.2" className={sc} />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" className={sc} />
    </svg>
  );
}

function PlayIcon() {
  return <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.5l7 4.5-7 4.5z" /></svg>;
}
function PauseIcon() {
  return <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1" width="3" height="10" rx="0.5" /><rect x="7" y="1" width="3" height="10" rx="0.5" /></svg>;
}
function StopIcon() {
  return <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="8" height="8" rx="1" /></svg>;
}
function DeleteIcon() {
  return <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l6 6M9 3l-6 6" /></svg>;
}

function KpiCell({ value, label, active }: { value: number; label: string; active: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
      <span className={`text-lg font-light tabular-nums leading-none ${active ? "text-cyan-accent" : "text-white/60"}`}>
        {value}
      </span>
      <span className="text-[9px] font-mono tracking-widest uppercase text-white/40 truncate">{label}</span>
    </div>
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
      className="flex items-center gap-2 w-full min-w-0 py-1.5 px-2 rounded hover:bg-white/3 transition-colors group text-left"
    >
      <ServiceIcon text={mission.name} />
      <span className={`text-xs truncate flex-1 min-w-0 transition-colors ${isRunning ? "text-cyan-accent" : "text-white/70 group-hover:text-white/90"}`}>
        {mission.name}
      </span>
      <span className={`text-[9px] font-mono shrink-0 ${isRunning ? "text-cyan-accent/60" : "text-white/35"}`}>
        {isRunning ? "en cours" : mission.enabled ? "actif" : "inactif"}
      </span>
    </button>
  );
}

function AssetChip({ asset }: { asset: RightPanelAsset }) {
  const ext = ASSET_ICON[asset.type] ?? "FIC";
  const cleanName = stripEmoji(asset.name);
  return (
    <div
      className="flex items-center gap-1.5 rounded bg-white/5 border border-white/8 px-2 py-1 cursor-pointer hover:bg-white/8 hover:border-white/15 transition-colors min-w-0 overflow-hidden"
      title={cleanName}
    >
      <span className="text-[8px] font-mono text-white/50 tracking-wide shrink-0">{ext}</span>
      <span className="text-[10px] text-white/65 truncate">{cleanName}</span>
    </div>
  );
}

function RightPanelInner() {
  const { data, loading } = useRightPanel();
  const stream = useRunStreamOptional();
  const connected = stream?.connected ?? false;
  const { focal, secondary, isFocused } = useFocalObject();
  const v2 = useOrchestrate();
  const sidebarCtx = useSidebarOptional();
  const { state: halo } = useHaloRuntime();

  const rawMissions = data.missions ?? [];
  const missions = rawMissions.length > 0 ? rawMissions : DEMO_MISSIONS;
  const assets = data.assets ?? [];
  const recentRuns = data.recentRuns ?? [];
  const currentRun = data.currentRun;
  const connHealth = data.connectorHealth;

  const [panelState, setPanelState] = useState<PanelState>("INDEX");
  const [documentObject, setDocumentObject] = useState<FocalObject | null>(null);
  const [isPending, setIsPending] = useState(false);
  const actionLockRef = useRef(false);
  const prevFocalIdRef = useRef(focal?.id);
  const prevThreadIdRef = useRef(sidebarCtx?.state.activeThreadId);
  // Tracks the focal object ID the user explicitly dismissed (Escape).
  // Auto-materialize will not re-open the same object until a new one arrives.
  const dismissedFocalIdRef = useRef<string | null>(null);

  // When thread changes, reset focal state and dismissed guard completely
  if (sidebarCtx?.state.activeThreadId !== prevThreadIdRef.current) {
    prevThreadIdRef.current = sidebarCtx?.state.activeThreadId;
    dismissedFocalIdRef.current = null;
    setPanelState("INDEX");
    setDocumentObject(null);
  }

  // When focal object changes externally, stay in INDEX (user clicks to open DOCUMENT)
  if (focal?.id !== prevFocalIdRef.current) {
    prevFocalIdRef.current = focal?.id;
    if (!focal && panelState === "DOCUMENT") {
      setPanelState("INDEX");
      setDocumentObject(null);
    }
  }

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

  // Keyboard: Escape closes Document → INDEX
  useEffect(() => {
    if (panelState !== "DOCUMENT") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDocument();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [panelState, closeDocument]);

  // Auto-materialize: when focal becomes ready, open it automatically.
  // Respects explicit dismissal: will not re-open the same object the user closed.
  // Clears dismissal guard when a genuinely new focal object arrives.
  useEffect(() => {
    if (!focal) return;

    // New focal object arrived — clear the dismissed guard
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
  }, [focal?.id, focal?.status, panelState, openDocument]);

  // Navigate between objects while in DOCUMENT state
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

  const isDocument = panelState === "DOCUMENT" && documentObject;

  return (
    <aside
      className="hidden h-full shrink-0 flex-col border-l border-white/5 bg-transparent lg:flex relative overflow-hidden"
      style={{
        width: isDocument ? "48%" : 280,
        minWidth: 280,
        maxWidth: 760,
        transition: "width 260ms cubic-bezier(0.22, 1, 0.36, 1)",
        contain: "strict",
        willChange: "width",
      }}
    >
      {/* Status indicator */}
      <div className="flex h-12 items-center px-6 shrink-0 z-20">
        {isDocument && (
          <button
            onClick={closeDocument}
            className="text-[9px] font-mono tracking-wider text-white/50 hover:text-white border border-transparent hover:border-white/20 px-2 py-1 transition-colors duration-200 cursor-pointer"
          >
            ← INDEX
          </button>
        )}
        <span
          className={`ml-auto transition-all duration-500 ${
            connected ? "status-dot" : "h-[5px] w-[5px] rounded-full bg-white/10"
          }`}
        />
      </div>

      {/* ── STATE B: DOCUMENT ── */}
      {isDocument && (
        <div className="flex-1 overflow-y-auto scrollbar-hide px-6 pb-8 min-h-0">
          <FocalObjectRenderer
            object={documentObject}
            onAction={handleFocalAction}
            isPending={isPending}
            mode="full"
          />

          {/* Document navigation */}
          {allObjects.length > 1 && (
            <div className="flex justify-between items-center text-sm text-white/50 mt-10 pt-6 border-t border-white/3">
              <button
                onClick={() => hasPrev && navigateDocument(allObjects[currentDocIndex - 1])}
                disabled={!hasPrev}
                className="transition-colors duration-200 hover:text-white border border-transparent hover:border-white/20 px-2 py-1 disabled:opacity-20 disabled:cursor-default text-[11px] font-mono cursor-pointer"
              >
                ← Précédent
              </button>
              <button
                onClick={() => hasNext && navigateDocument(allObjects[currentDocIndex + 1])}
                disabled={!hasNext}
                className="transition-colors duration-200 hover:text-white border border-transparent hover:border-white/20 px-2 py-1 disabled:opacity-20 disabled:cursor-default text-[11px] font-mono cursor-pointer"
              >
                Suivant →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── STATE A: INDEX ── */}
      {!isDocument && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* SYSTEM STATE */}
          <div className="px-4 py-3 border-b border-white/5">
            <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-cyan-accent/50">
              system
            </div>
            <div className="mt-2 text-xs text-white/60">
              {focal?.status === "ready"
                ? "active"
                : halo.coreState !== "idle"
                ? "thinking"
                : "idle"}{" "}
              · {missions?.length ?? 0} missions
            </div>
          </div>

          {/* MISSIONS */}
          <div className="px-4 py-4 space-y-3">
            <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-cyan-accent/50">
              missions
            </div>

            <div className="space-y-2">
              {(missions ?? []).slice(0, 4).map((mission) => (
                <MissionRow
                  key={mission.id}
                  mission={mission}
                  onInspect={() => openDocument(missionToFocalObject(mission))}
                />
              ))}
            </div>
          </div>

          {/* ASSETS */}
          <div className="px-4 py-4 border-t border-white/5 space-y-3">
            <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-cyan-accent/50">
              assets
            </div>

            <div className="flex flex-wrap gap-2">
              {(assets ?? []).slice(0, 6).map((asset: any) => (
                <div
                  key={asset.id}
                  className="px-3 py-1 rounded-md border border-white/5 bg-white/[0.02] text-[10px] text-white/60 font-mono uppercase tracking-[0.15em]"
                >
                  {asset.type}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </aside>
  );
}

const RightPanel = memo(RightPanelInner);
export default RightPanel;
