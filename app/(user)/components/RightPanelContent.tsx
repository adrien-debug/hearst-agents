"use client";

/**
 * RightPanelContent — orchestrateur du panel droit (architecture v2).
 *
 * Structure :
 *   1. PulseStrip     — status système (top)
 *   2. FocalCard      — notifications communication
 *   3. RightPanelNav  — navigation tuiles (Général / Rapports / Missions / Livrables)
 *   4. ContentView    — vue dynamique selon navigation
 *   5. Status footer  — SSE live/offline
 */

import { useEffect, useState, useRef } from "react";
import type { RightPanelData } from "@/lib/core/types";
import { mapFocalObject, mapFocalObjects } from "@/lib/core/types/focal";
import { useFocalStore } from "@/stores/focal";
import { useNavigationStore } from "@/stores/navigation";
import { useRuntimeStore } from "@/stores/runtime";
import { OAuthStatusCard } from "./OAuthStatusCard";
import { PulseStrip } from "./right-panel/PulseStrip";
import { FocalCard } from "./right-panel/FocalCard";
import { RightPanelNav, type PanelView } from "./right-panel/RightPanelNav";
import { GeneralDashboard } from "./right-panel/GeneralDashboard";
import { AssetsGrid } from "./right-panel/AssetsGrid";
import { MissionsList } from "./right-panel/MissionsList";
import { useRunReportSuggestion } from "./right-panel/useRunReportSuggestion";

interface RightPanelContentProps {
  onClose?: () => void;
}

const STORAGE_KEY = "hearst.rightpanel.view";

export function RightPanelContent({ onClose }: RightPanelContentProps) {
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);

  const [data, setData] = useState<RightPanelData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<PanelView>("general");

  // localStorage lu en useEffect (pas en useState initializer) sinon
  // hydration mismatch : SSR retourne "general", client retourne la valeur
  // sauvegardée → tiles d'activeView désynchronisées entre serveur et client.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as PanelView | null;
      if (saved && ["general", "reports", "missions", "assets"].includes(saved)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- initialisation SSR-safe : le lazy-initializer causerait un hydration mismatch (server vs client localStorage)
        setActiveView(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Save view when changed
  const handleViewChange = (view: PanelView) => {
    setActiveView(view);
    try {
      localStorage.setItem(STORAGE_KEY, view);
    } catch {
      /* ignore */
    }
  };

  // Reset data when thread changes
  const [trackedThreadId, setTrackedThreadId] = useState<string | null>(activeThreadId ?? null);
  if (trackedThreadId !== (activeThreadId ?? null)) {
    setTrackedThreadId(activeThreadId ?? null);
    setData(null);
    setActiveView("general"); // Reset to general on thread change
  }

  // SSE data fetching (same as before)
  const activeThreadIdRef = useRef(activeThreadId);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  const runtimeEvents = useRuntimeStore((s) => s.events);
  const lastAssetEventTsRef = useRef<number>(0);
  useEffect(() => {
    if (!activeThreadId) return;
    const assetEvent = runtimeEvents.find((e) => e.type === "asset_generated");
    if (!assetEvent || assetEvent.timestamp <= lastAssetEventTsRef.current) return;
    lastAssetEventTsRef.current = assetEvent.timestamp;
    fetch(`/api/v2/right-panel?thread_id=${encodeURIComponent(activeThreadId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((panelData: RightPanelData | null) => {
        if (panelData) setData(panelData);
      })
      .catch(() => {});
  }, [runtimeEvents, activeThreadId]);

  useEffect(() => {
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
        setData({ assets, missions, focalObject: undefined, secondaryObjects: undefined } as RightPanelData);
        setIsConnected(false);
        setLoading(false);
      });
      return () => { cancelled = true; };
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

  const panelData = data;
  const focalObject = panelData?.focalObject;
  const secondaryObjects = panelData?.secondaryObjects;
  const assets = panelData?.assets ?? [];
  const missions = panelData?.missions ?? [];
  const reportSuggestions = panelData?.reportSuggestions;

  const { runningSpecs, runSuggestion } = useRunReportSuggestion(activeThreadId);

  // Render content based on active view
  const renderContent = () => {
    switch (activeView) {
      case "general":
        return (
          <GeneralDashboard
            assets={assets}
            missions={missions}
            reportSuggestions={reportSuggestions}
            onViewChange={handleViewChange}
            activeThreadId={activeThreadId}
            loading={loading}
            runningSpecs={runningSpecs}
            onRunSuggestion={runSuggestion}
          />
        );
      case "reports":
        return (
          <AssetsGrid
            assets={assets}
            reportSuggestions={reportSuggestions}
            activeThreadId={activeThreadId}
            loading={loading}
            runningSpecs={runningSpecs}
            onRunSuggestion={runSuggestion}
          />
        );
      case "missions":
        return (
          <MissionsList missions={missions} activeThreadId={activeThreadId} loading={loading} />
        );
      case "assets":
        return (
          <div className="flex flex-col h-full">
            <div style={{ padding: "var(--space-3)", borderBottom: "1px solid var(--border-shell)" }}>
              <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
                Tous les livrables {assets.length.toString().padStart(2, "0")}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AssetsGrid
                assets={assets}
                reportSuggestions={undefined}
                activeThreadId={activeThreadId}
                loading={loading}
                runningSpecs={runningSpecs}
                onRunSuggestion={runSuggestion}
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <aside
      className="h-full flex flex-col z-20 relative border-l border-[var(--border-shell)]"
      style={{ width: "var(--width-context)", background: "var(--bg-rail)" }}
    >
      {/* Mobile header */}
      {onClose && (
        <div className="p-4 flex items-center justify-between md:hidden border-b border-[var(--border-shell)]">
          <p className="t-13 font-medium">Contexte</p>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <OAuthStatusCard />

      {/* Strate 1 — PULSE */}
      <PulseStrip />

      {/* Strate 2 — FOCAL (notifications) */}
      <FocalCard focalObject={focalObject} secondaryObjects={secondaryObjects} activeThreadId={activeThreadId} />

      {/* Strate 3 — NAVIGATION */}
      <RightPanelNav
        activeView={activeView}
        onChangeView={handleViewChange}
        assetsCount={assets.length}
        reportsCount={assets.filter((a) => a.type === "report").length}
        missionsCount={missions.length}
        suggestionsCount={reportSuggestions?.length ?? 0}
        eventsCount={runtimeEvents.length}
      />

      {/* Strate 4 — CONTENT */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {renderContent()}
      </div>

      {/* STATUS footer */}
      <div className="shrink-0 border-t border-[var(--border-shell)] px-4 py-2 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-2 t-9 font-mono uppercase tracking-section px-2 py-1 rounded-sm shrink-0 ${
            !activeThreadId
              ? "text-[var(--text-faint)]"
              : isConnected
                ? "bg-[var(--cykan-bg-active)] text-[var(--cykan)]"
                : "text-[var(--text-faint)]"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-pill shrink-0 ${
              !activeThreadId ? "bg-[var(--text-ghost)]" : isConnected ? "bg-[var(--cykan)]" : "bg-[var(--text-ghost)]"
            }`}
          />
          {!activeThreadId ? "standby" : isConnected ? "live" : "offline"}
        </span>
      </div>
    </aside>
  );
}
