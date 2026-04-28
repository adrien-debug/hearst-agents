"use client";

/**
 * RightPanelContent — orchestrateur des 3 strates :
 *   1. PulseStrip     — bandeau d'activité live (top)
 *   2. FocalCard      — carte focal contextuelle
 *   3. LibraryTabs    — onglets Assets / Missions / Activité
 * + footer pill SSE (live/offline/standby)
 *
 * Ce composant garde la responsabilité unique du fetch (SSE EventSource pour
 * un thread actif, REST pour la "library home" sans thread) et passe les
 * données aux sous-composants en props. Aucun sous-composant ne re-fetch.
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
import { LibraryTabs } from "./right-panel/LibraryTabs";

interface RightPanelContentProps {
  onClose?: () => void;
}

export function RightPanelContent({ onClose }: RightPanelContentProps) {
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);

  const [data, setData] = useState<RightPanelData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  // Reset `data` quand le thread change. Pattern "Adjusting state on prop
  // change" — au render, pas en useEffect (évite cascade de renders).
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [trackedThreadId, setTrackedThreadId] = useState<string | null>(activeThreadId ?? null);
  if (trackedThreadId !== (activeThreadId ?? null)) {
    setTrackedThreadId(activeThreadId ?? null);
    setData(null);
  }

  // Migration douce : la version précédente persistait l'état des sections
  // collapsibles. La nouvelle archi en strates supprime ce concept.
  // One-shot cleanup au mount.
  useEffect(() => {
    try {
      localStorage.removeItem("hearst.rightpanel.openSections");
    } catch {
      /* ignore */
    }
  }, []);

  const activeThreadIdRef = useRef(activeThreadId);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  // Re-fetch panel quand un asset_generated event arrive — garantit que la
  // grille assets reflète la production live sans attendre le prochain SSE
  // tick. On subscribe au store events.
  const runtimeEvents = useRuntimeStore((s) => s.events);
  const lastAssetEventTsRef = useRef<number>(0);
  useEffect(() => {
    if (!activeThreadId) return;
    const assetEvent = runtimeEvents.find((e) => e.type === "asset_generated");
    if (!assetEvent) return;
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

  const hasActiveThread = Boolean(activeThreadId);
  const panelData = data;
  const focalObject = panelData?.focalObject;
  const secondaryObjects = panelData?.secondaryObjects;
  const assets = panelData?.assets ?? [];
  const missions = panelData?.missions ?? [];

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

      {/* Carte de statut OAuth — visible uniquement pendant qu'une popup
          de connexion est ouverte. Affichée en haut du panel pour rester
          visible même quand on scrolle dans les sections en dessous. */}
      <OAuthStatusCard />

      {/* Strate 1 — PULSE */}
      <PulseStrip />

      {/* Strate 2 — FOCAL */}
      <FocalCard
        focalObject={focalObject}
        secondaryObjects={secondaryObjects}
        activeThreadId={activeThreadId}
      />

      {/* Strate 3 — LIBRARY (tabs Assets / Missions / Activité) */}
      <LibraryTabs
        assets={assets}
        missions={missions}
        activeThreadId={activeThreadId}
        loading={loading}
      />

      {/* STATUS — footer compact. Reflète uniquement l'état SSE du panneau. */}
      <div className="shrink-0 border-t border-[var(--border-shell)] px-4 py-2.5 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 t-9 font-mono tracking-[0.16em] uppercase px-2 py-0.5 rounded-sm shrink-0 ${
          !hasActiveThread
            ? "text-[var(--text-faint)]"
            : isConnected
              ? "bg-[var(--cykan)]/10 text-[var(--cykan)]"
              : "text-[var(--text-faint)]"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            !hasActiveThread ? "bg-[var(--text-ghost)]" :
            isConnected ? "bg-[var(--cykan)]" : "bg-[var(--text-ghost)]"
          }`} />
          {!hasActiveThread ? "standby" : isConnected ? "live" : "offline"}
        </span>
      </div>
    </aside>
  );
}
