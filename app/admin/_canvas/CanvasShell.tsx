"use client";

import { useEffect, useState } from "react";
import { useCanvasStore } from "./store";
import { useReplay } from "./use-replay";
import { useEventStream } from "./use-event-stream";
import FlowCanvas from "./FlowCanvas";
import FlowLegend from "./FlowLegend";
import NodeDetailPanel from "./NodeDetailPanel";
import RunRail from "./RunRail";
import Scrubber from "./Scrubber";
import { NODES } from "./topology";

interface PersistedEvent {
  type: string;
  ts: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>;
}

async function safeJsonFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

export default function CanvasShell() {
  const mode = useCanvasStore((s) => s.mode);
  const setMode = useCanvasStore((s) => s.setMode);
  const setSelectedRunId = useCanvasStore((s) => s.setSelectedRunId);
  const selectedRunId = useCanvasStore((s) => s.selectedRunId);
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useCanvasStore((s) => s.setSelectedNodeId);

  const [events, setEvents] = useState<PersistedEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  useEventStream(mode === "live");
  const replay = useReplay(events);

  useEffect(() => {
    if (!selectedRunId) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    setLoadingEvents(true);
    safeJsonFetch<{ events: PersistedEvent[] }>(`/api/admin/runs/${selectedRunId}/events`).then(
      (data) => {
        if (cancelled) return;
        setEvents(data?.events ?? []);
        setLoadingEvents(false);
      },
    );
    return () => {
      cancelled = true;
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
  const showScrubber = !!selectedRunId;

  return (
    <div
      data-theme="light"
      className="flex flex-col h-screen bg-bg overflow-hidden text-text"
    >
      {/* Top header — surfaces Linear day via data-theme */}
      <header className="flex items-center justify-between px-(--space-8) py-(--space-5) border-b border-line bg-surface shrink-0 relative z-20">
        <div className="flex items-baseline gap-(--space-6)">
          <div>
            <p className="t-10 font-mono uppercase tracking-brand text-(--cykan) opacity-80">
              Protocol_Active
            </p>
            <h1 className="t-28 font-bold tracking-tight text-text leading-tight mt-(--space-1) uppercase">
              Pipeline live
            </h1>
          </div>
          <span className="t-11 font-mono uppercase tracking-widest text-text-ghost hidden xl:inline">
            {mode === "live"
              ? "tail global event bus"
              : selectedRunId
                ? "replay d'un run persisté"
                : `${NODES.length} stages • flow gauche → droite`}
          </span>
        </div>

        <div className="flex items-center gap-(--space-5)">
          <FlowLegend />
          <button
            type="button"
            onClick={onLiveToggle}
            className={[
              "flex items-center gap-(--space-2) t-11 font-mono uppercase tracking-widest px-(--space-4) py-(--space-2) rounded-xs border transition-all duration-(--duration-slow) ease-(--ease-standard)",
              mode === "live"
                ? "border-(--cykan)/60 text-(--cykan) bg-(--cykan)/10 shadow-(--glow-cyan-sm)"
                : "border-line-strong text-text-muted hover:text-text hover:border-(--cykan)/40 hover:bg-(--cykan)/5",
            ].join(" ")}
          >
            <span
              className={[
                "size-(--space-2) rounded-(--radius-full)",
                mode === "live"
                  ? "bg-(--cykan) animate-pulse shadow-(--glow-cyan-sm)"
                  : "bg-text-ghost",
              ].join(" ")}
            />
            {mode === "live" ? "Live actif" : "Activer le live"}
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
                <div className="rounded-(--radius-full) border border-(--cykan)/35 bg-(--surface)/95 backdrop-blur-md px-(--space-5) py-(--space-2) t-11 font-mono uppercase tracking-widest text-(--cykan) shadow-(--shadow-md)">
                  active le live ↑ — la fiche du stage s’affiche à droite · runs en dessous
                </div>
              </div>
            )}
          </div>
          {showScrubber && (
            <Scrubber
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

        <aside className="hidden lg:flex flex-col shrink-0 w-(--width-context) min-w-0 min-h-0 border-l border-line bg-bg-elev">
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
