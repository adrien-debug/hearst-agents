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
    <div className="flex flex-col h-screen bg-bg overflow-hidden">
      {/* Top header */}
      <header className="flex items-center justify-between px-(--space-8) py-(--space-5) border-b border-line bg-linear-to-r from-(--cykan)/4 via-transparent to-transparent shrink-0">
        <div className="flex items-baseline gap-(--space-6)">
          <div>
            <p className="t-10 font-mono uppercase tracking-[0.22em] text-text-faint">
              Hearst Admin
            </p>
            <h1 className="t-28 font-bold tracking-tight text-text leading-tight mt-(--space-1)">
              Pipeline live
            </h1>
          </div>
          <span className="t-11 font-mono uppercase tracking-[0.15em] text-(--text-faint)/70 hidden xl:inline">
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
              "flex items-center gap-(--space-2) t-11 font-mono uppercase tracking-[0.15em] px-(--space-4) py-(--space-2) rounded-xs border transition-colors",
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
                  : "bg-text-faint",
              ].join(" ")}
            />
            {mode === "live" ? "Live actif" : "Activer le live"}
          </button>
        </div>
      </header>

      {/* Main: canvas + rail */}
      <div className="flex-1 flex min-h-0">
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex items-center justify-center min-h-0 px-(--space-8) py-(--space-6) relative">
            <FlowCanvas />

            {/* Centered idle hint — explains how to use the canvas */}
            {showIdleHint && (
              <div className="absolute top-(--space-8) left-1/2 -translate-x-1/2 pointer-events-none z-10">
                <div className="rounded-(--radius-full) border border-(--cykan)/30 bg-(--bg-elev)/80 backdrop-blur px-(--space-5) py-(--space-2) t-11 font-mono uppercase tracking-[0.18em] text-(--cykan)/80">
                  active le live ↑ ou choisis un run ↘
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

      {/* Selected node detail — slide-out panel ancré à droite, scrollable. */}
      {selectedNode && (
        <aside
          className={[
            "fixed top-[88px] right-[300px] z-50",
            "w-[360px] max-h-[calc(100vh-120px)] overflow-y-auto",
            "rounded-md border border-(--cykan)/30",
            "bg-(--bg-elev)/95 backdrop-blur",
            "shadow-(--glow-cyan-md)",
          ].join(" ")}
        >
          <header className="sticky top-0 z-10 flex items-center justify-between gap-(--space-3) px-(--space-4) py-(--space-3) border-b border-line bg-(--bg-elev)/95 backdrop-blur">
            <div className="flex flex-col gap-[2px] min-w-0">
              <span className="t-13 font-medium text-text truncate">
                {selectedNode.label}
              </span>
              <span className="t-10 font-mono uppercase tracking-[0.14em] text-(--text-faint)/80">
                {selectedNode.sublabel}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedNodeId(null)}
              className="t-10 font-mono uppercase tracking-[0.12em] text-text-faint hover:text-text transition-colors shrink-0"
            >
              fermer
            </button>
          </header>

          <div className="flex flex-col gap-(--space-4) px-(--space-4) py-(--space-4)">
            <p className="t-12 leading-relaxed text-text-muted">
              {selectedNode.description}
            </p>

            <div className="grid grid-cols-2 gap-(--space-3)">
              <div className="flex flex-col gap-(--space-1)">
                <span className="t-9 font-mono uppercase tracking-[0.18em] text-(--text-faint)/70">
                  Inputs
                </span>
                <span className="t-11 text-text">{selectedNode.inputs}</span>
              </div>
              <div className="flex flex-col gap-(--space-1)">
                <span className="t-9 font-mono uppercase tracking-[0.18em] text-(--text-faint)/70">
                  Outputs
                </span>
                <span className="t-11 text-text">{selectedNode.outputs}</span>
              </div>
            </div>

            <div className="flex flex-col gap-(--space-2)">
              <span className="t-9 font-mono uppercase tracking-[0.18em] text-(--text-faint)/70">
                Source
              </span>
              <div className="rounded-sm bg-bg-soft px-(--space-2) py-[6px]">
                <p className="t-10 font-mono tracking-[0.04em] text-(--cykan) break-all leading-snug">
                  {selectedNode.fileHint}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-(--space-2)">
              <span className="t-9 font-mono uppercase tracking-[0.18em] text-(--text-faint)/70">
                Events SSE
              </span>
              <ul className="flex flex-col gap-(--space-1)">
                {selectedNode.events.map((e) => (
                  <li
                    key={e}
                    className="t-10 font-mono tracking-[0.02em] text-text-soft before:content-['—_'] before:text-(--text-faint)/60"
                  >
                    {e}
                  </li>
                ))}
              </ul>
            </div>

            {selectedNode.branches && selectedNode.branches.length > 0 && (
              <div className="flex flex-col gap-(--space-2)">
                <span className="t-9 font-mono uppercase tracking-[0.18em] text-(--text-faint)/70">
                  Branchements
                </span>
                <ul className="flex flex-col gap-(--space-1)">
                  {selectedNode.branches.map((b) => (
                    <li
                      key={b}
                      className="t-11 text-text-soft leading-snug"
                    >
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-(--space-2) border-t border-line">
              <span
                className={[
                  "t-9 font-mono uppercase tracking-[0.18em]",
                  selectedNode.toggleable ? "text-(--cykan)/80" : "text-(--text-faint)/60",
                ].join(" ")}
              >
                {selectedNode.toggleable && selectedNode.flagKey
                  ? `toggle actif — flag « ${selectedNode.flagKey} »`
                  : "stage non toggleable"}
              </span>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
