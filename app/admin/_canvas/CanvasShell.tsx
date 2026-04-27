"use client";

import { useEffect, useState } from "react";
import { useCanvasStore } from "./store";
import { useReplay } from "./use-replay";
import { useEventStream } from "./use-event-stream";
import FlowCanvas from "./FlowCanvas";
import FlowLegend from "./FlowLegend";
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
    <div className="flex flex-col h-screen bg-[var(--bg)] overflow-hidden">
      {/* Top header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-[var(--line)] bg-gradient-to-r from-[var(--cykan)]/[0.04] via-transparent to-transparent shrink-0">
        <div className="flex items-baseline gap-6">
          <div>
            <p className="t-10 font-mono uppercase tracking-[0.22em] text-[var(--text-faint)]">
              Hearst Admin
            </p>
            <h1 className="t-28 font-bold tracking-tight text-[var(--text)] leading-tight mt-1">
              Pipeline live
            </h1>
          </div>
          <span className="t-11 font-mono uppercase tracking-[0.15em] text-[var(--text-faint)]/70 hidden xl:inline">
            {mode === "live"
              ? "tail global event bus"
              : selectedRunId
                ? "replay d'un run persisté"
                : "11 stages • 8 colonnes • flow gauche → droite"}
          </span>
        </div>

        <div className="flex items-center gap-5">
          <FlowLegend />
          <button
            type="button"
            onClick={onLiveToggle}
            className={[
              "flex items-center gap-2 t-11 font-mono uppercase tracking-[0.15em] px-4 py-2 rounded border transition-colors",
              mode === "live"
                ? "border-[var(--cykan)]/60 text-[var(--cykan)] bg-[var(--cykan)]/10 shadow-[var(--glow-cyan-sm)]"
                : "border-[var(--line-strong)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--cykan)]/40 hover:bg-[var(--cykan)]/5",
            ].join(" ")}
          >
            <span
              className={[
                "size-2 rounded-full",
                mode === "live"
                  ? "bg-[var(--cykan)] animate-pulse shadow-[0_0_8px_var(--cykan)]"
                  : "bg-[var(--text-faint)]",
              ].join(" ")}
            />
            {mode === "live" ? "Live actif" : "Activer le live"}
          </button>
        </div>
      </header>

      {/* Main: canvas + rail */}
      <div className="flex-1 flex min-h-0">
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex items-center justify-center min-h-0 px-8 py-6 relative">
            <FlowCanvas />

            {/* Centered idle hint — explains how to use the canvas */}
            {showIdleHint && (
              <div className="absolute top-8 left-1/2 -translate-x-1/2 pointer-events-none">
                <div className="rounded-full border border-[var(--cykan)]/30 bg-[var(--bg-elev)]/80 backdrop-blur px-5 py-2 t-11 font-mono uppercase tracking-[0.18em] text-[var(--cykan)]/80">
                  active le live ↑ ou choisis un run →
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

        <RunRail onSelect={onSelectRun} />
      </div>

      {/* Selected node detail */}
      {selectedNode && (
        <div className="fixed top-28 right-[300px] max-w-sm rounded-md border border-[var(--cykan)]/30 bg-[var(--bg-elev)]/95 backdrop-blur p-4 shadow-[var(--glow-cyan-md)] z-50">
          <div className="flex items-center justify-between mb-2 gap-3">
            <span className="t-13 font-medium text-[var(--text)]">
              {selectedNode.label}
            </span>
            <button
              type="button"
              onClick={() => setSelectedNodeId(null)}
              className="t-10 font-mono uppercase tracking-[0.1em] text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
            >
              fermer
            </button>
          </div>
          <p className="t-11 text-[var(--text-muted)] mb-3">{selectedNode.sublabel}</p>
          <div className="rounded-sm bg-[var(--bg-soft)] px-2 py-1.5 mb-3">
            <p className="t-10 font-mono tracking-[0.05em] text-[var(--cykan)] break-all">
              {selectedNode.fileHint}
            </p>
          </div>
          <p
            className={[
              "t-9 font-mono uppercase tracking-[0.18em]",
              selectedNode.toggleable ? "text-[var(--cykan)]/80" : "text-[var(--text-faint)]/70",
            ].join(" ")}
          >
            {selectedNode.toggleable
              ? "toggle actif via feature flag"
              : "toggle on/off — bientôt"}
          </p>
        </div>
      )}
    </div>
  );
}
