"use client";

import { useEffect, useState } from "react";
import { useCanvasStore } from "./store";
import { useReplay } from "./use-replay";
import { useEventStream } from "./use-event-stream";
import { useEdgeUsage } from "./use-edge-usage";
import FlowCanvas from "./FlowCanvas";
import FlowLegend from "./FlowLegend";
import NodeDetailPanel from "./NodeDetailPanel";
import RunRail from "./RunRail";
import RunWaterfall from "./RunWaterfall";
import { NODES } from "./topology";
import { fetchAdminJson } from "./safe-admin-fetch";

interface PersistedEvent {
  type: string;
  ts: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>;
}

export default function CanvasShell() {
  const mode = useCanvasStore((s) => s.mode);
  const setMode = useCanvasStore((s) => s.setMode);
  const setSelectedRunId = useCanvasStore((s) => s.setSelectedRunId);
  const selectedRunId = useCanvasStore((s) => s.selectedRunId);
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useCanvasStore((s) => s.setSelectedNodeId);
  const asideCollapsed = useCanvasStore((s) => s.asideCollapsed);
  const toggleAsideCollapsed = useCanvasStore((s) => s.toggleAsideCollapsed);

  const [events, setEvents] = useState<PersistedEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  useEventStream(mode === "live");
  useEdgeUsage();
  const replay = useReplay(events);

  useEffect(() => {
    if (!selectedRunId) {
      const id = requestAnimationFrame(() => {
        setEvents([]);
      });
      return () => cancelAnimationFrame(id);
    }
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      setLoadingEvents(true);
    });
    fetchAdminJson<{ events: PersistedEvent[] }>(`/api/admin/runs/${selectedRunId}/events`).then(
      (data) => {
        if (cancelled) return;
        if (!data) {
          console.error(`[CanvasShell] Erreur lors de la récupération des événements pour le run ${selectedRunId}`);
        }
        setEvents(data?.events ?? []);
        setLoadingEvents(false);
      },
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [selectedRunId]);

  const onSelectRun = (runId: string) => {
    if (mode === "live") setMode("idle");
    setSelectedRunId(runId);
  };

  const onLiveToggle = () => {
    if (mode === "live") {
      setMode("idle");
    } else {
      setMode("live");
      setSelectedRunId(null);
      replay.reset();
    }
  };

  const selectedNode = selectedNodeId
    ? NODES.find((n) => n.id === selectedNodeId) ?? null
    : null;

  const showIdleHint = mode !== "live" && !selectedRunId;
  const showWaterfall = !!selectedRunId;

  const statusText =
    mode === "live"
      ? "tail global event bus"
      : selectedRunId
        ? "replay d'un run persisté"
        : `${NODES.length} stages • flow gauche → droite`;

  return (
    <div className="flex flex-col h-full bg-bg overflow-hidden text-text">
      {/* Action strip — page chrome is in AdminTopbar; keep this thin. */}
      <header className="flex items-center justify-between gap-(--space-4) px-(--space-6) py-(--space-2) border-b border-line bg-surface shrink-0 relative z-20">
        <span className="t-10 font-mono uppercase tracking-(--tracking-stretch) text-text-faint truncate">
          {statusText}
        </span>

        <div className="flex items-center gap-(--space-4) shrink-0">
          <FlowLegend />
          <button
            type="button"
            onClick={onLiveToggle}
            className={[
              "flex items-center gap-(--space-2) t-10 font-mono uppercase tracking-(--tracking-stretch) px-(--space-3) py-(--space-1) rounded-(--radius-xs) border transition-all duration-(--duration-slow) ease-(--ease-standard)",
              mode === "live"
                ? "border-(--cykan)/60 text-(--cykan) bg-(--cykan)/10 shadow-(--glow-cyan-sm)"
                : "border-line-strong text-text-muted hover:text-text hover:border-(--cykan)/40 hover:bg-(--cykan)/5",
            ].join(" ")}
          >
            <span
              className={[
                "size-(--space-2) rounded-(--radius-pill)",
                mode === "live"
                  ? "bg-(--cykan) animate-pulse shadow-(--glow-cyan-sm)"
                  : "bg-text-ghost",
              ].join(" ")}
            />
            {mode === "live" ? "Live actif" : "Activer le live"}
          </button>
          <button
            type="button"
            onClick={toggleAsideCollapsed}
            title={asideCollapsed ? "Afficher le panneau droit" : "Masquer le panneau droit"}
            className="hidden lg:flex items-center justify-center size-(--space-8) rounded-(--radius-xs) border border-line-strong text-text-muted hover:text-text hover:border-(--cykan)/40 transition-colors"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={asideCollapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} />
              <path d="M3 4v16" opacity="0.4" />
            </svg>
          </button>
        </div>
      </header>

      {/* Corps : canvas (centre) + colonne droite fixe (fiche stage + runs) */}
      <div className="flex-1 flex min-h-0">
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="flex-1 flex items-center justify-center min-h-0 relative">
            <FlowCanvas />

            {showIdleHint && (
              <div className="absolute top-(--space-8) left-1/2 -translate-x-1/2 pointer-events-none z-10 max-w-[min(100%,var(--width-center-max))] text-center">
                <div className="rounded-(--radius-pill) border border-(--cykan)/35 bg-(--surface)/95 backdrop-blur-md px-(--space-5) py-(--space-2) t-11 font-mono uppercase tracking-(--tracking-stretch) text-(--cykan) shadow-(--shadow-md)">
                  active le live ↑ — la fiche du stage s’affiche à droite · runs en dessous
                </div>
              </div>
            )}
          </div>
          {showWaterfall && (
            <RunWaterfall
              events={events}
              isPlaying={replay.isPlaying}
              progress={replay.progress}
              speed={replay.speed}
              onPlayToggle={replay.playToggle}
              onSpeedChange={replay.setSpeed}
              onReset={replay.reset}
              onSeek={replay.seek}
              disabled={mode === "live" || loadingEvents || events.length === 0}
            />
          )}
        </main>

        <aside
          className={[
            "flex-col shrink-0 w-(--width-context) min-w-0 min-h-0 border-l border-line bg-bg-elev",
            asideCollapsed ? "hidden" : "hidden lg:flex",
          ].join(" ")}
        >
          <section className="flex-3 min-h-0 flex flex-col overflow-hidden border-b border-line bg-surface">
            <NodeDetailPanel
              node={selectedNode}
              onClear={() => setSelectedNodeId(null)}
            />
          </section>
          <section className="flex-2 min-h-0 flex flex-col overflow-hidden">
            <RunRail onSelect={onSelectRun} />
          </section>
        </aside>
      </div>
    </div>
  );
}
