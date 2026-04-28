"use client";

import { useMemo } from "react";
import { useCanvasStore } from "./store";
import { reduceEvent } from "./event-reducer";
import { KIND_COLOR, NODES, type NodeId } from "./topology";

interface PersistedEvent {
  type: string;
  ts: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>;
}

interface StageBar {
  nodeId: NodeId;
  label: string;
  color: string;
  startMs: number;
  endMs: number;
}

interface Props {
  events: PersistedEvent[];
  isPlaying: boolean;
  progress: number; // 0..1
  speed: 1 | 4 | 16;
  onPlayToggle: () => void;
  onSpeedChange: (s: 1 | 4 | 16) => void;
  onReset: () => void;
  onSeek: (progress: number) => void;
  disabled?: boolean;
}

function fmt(ms: number): string {
  if (ms < 0) return "—";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Replay the events through the reducer to derive each stage's start/end.
 * A stage is "open" when reduceEvent emits `state: "active"` and "closed"
 * when it emits `success | failed | blocked`. Stages still open at the end
 * of the event list get an open-ended bar to the last timestamp.
 */
function computeBars(events: PersistedEvent[]): { bars: StageBar[]; totalMs: number } {
  if (events.length === 0) return { bars: [], totalMs: 0 };
  const t0 = events[0].ts;
  const tEnd = events[events.length - 1].ts;
  const totalMs = Math.max(tEnd - t0, 1);

  const activeSince: Partial<Record<NodeId, number>> = {};
  const bars: StageBar[] = [];

  for (const event of events) {
    const ops = reduceEvent({ type: event.type, ...event.payload });
    for (const op of ops) {
      if (op.kind !== "node") continue;
      if (op.state === "active") {
        if (activeSince[op.id] === undefined) activeSince[op.id] = event.ts;
      } else if (op.state === "success" || op.state === "failed" || op.state === "blocked") {
        const startTs = activeSince[op.id];
        const node = NODES.find((n) => n.id === op.id);
        if (startTs !== undefined && node) {
          bars.push({
            nodeId: op.id,
            label: node.label,
            color: KIND_COLOR[node.kind],
            startMs: Math.max(0, startTs - t0),
            endMs: event.ts - t0,
          });
          delete activeSince[op.id];
        }
      }
    }
  }

  for (const [nodeId, startTs] of Object.entries(activeSince)) {
    if (startTs === undefined) continue;
    const node = NODES.find((n) => n.id === nodeId);
    if (!node) continue;
    bars.push({
      nodeId: nodeId as NodeId,
      label: node.label,
      color: KIND_COLOR[node.kind],
      startMs: Math.max(0, startTs - t0),
      endMs: tEnd - t0,
    });
  }

  return { bars, totalMs };
}

export default function RunWaterfall({
  events,
  isPlaying,
  progress,
  speed,
  onPlayToggle,
  onSpeedChange,
  onReset,
  onSeek,
  disabled,
}: Props) {
  const selectedRunId = useCanvasStore((s) => s.selectedRunId);
  const setSelectedNodeId = useCanvasStore((s) => s.setSelectedNodeId);

  const { bars, totalMs } = useMemo(() => computeBars(events), [events]);

  if (!selectedRunId) {
    return (
      <div className="flex items-center justify-between gap-(--space-4) px-(--space-4) py-(--space-2) border-t border-line bg-bg-elev t-10 font-mono uppercase tracking-(--tracking-label) text-text-faint">
        Sélectionne un run pour rejouer
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-(--space-2) px-(--space-4) py-(--space-3) border-t border-line bg-bg-elev">
      {/* Waterfall track — bars positioned by start/duration ratio. Background is
          clickable for free seeking, individual bars seek + select the stage. */}
      <div
        role="presentation"
        className="relative h-(--space-6) rounded-(--radius-xs) bg-(--surface)/40 cursor-pointer overflow-hidden"
        onClick={(e) => {
          if (disabled) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          onSeek(Math.max(0, Math.min(1, ratio)));
        }}
      >
        {bars.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center t-9 font-mono uppercase tracking-(--tracking-wide) text-text-faint">
            Aucune trace
          </div>
        ) : (
          bars.map((bar, idx) => {
            const left = (bar.startMs / totalMs) * 100;
            const width = Math.max(((bar.endMs - bar.startMs) / totalMs) * 100, 0.4);
            return (
              <button
                key={`${bar.nodeId}-${idx}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (disabled) return;
                  setSelectedNodeId(bar.nodeId);
                  onSeek(bar.startMs / totalMs);
                }}
                title={`${bar.label} — ${fmt(bar.endMs - bar.startMs)}`}
                className="absolute top-1/2 -translate-y-1/2 h-(--space-4) rounded-(--radius-xs) border transition-opacity hover:brightness-125"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  background: `color-mix(in srgb, ${bar.color} 40%, transparent)`,
                  borderColor: `color-mix(in srgb, ${bar.color} 60%, transparent)`,
                }}
              />
            );
          })
        )}
        {/* Playhead */}
        <div
          aria-hidden
          className="absolute top-0 bottom-0 w-px bg-(--cykan) pointer-events-none"
          style={{
            left: `${Math.min(Math.max(progress, 0), 1) * 100}%`,
            boxShadow: "0 0 6px var(--cykan)",
          }}
        />
      </div>

      {/* Controls + position counter */}
      <div className="flex items-center gap-(--space-3) t-10 font-mono uppercase tracking-(--tracking-wide)">
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          className="px-(--space-2) py-(--space-1) rounded-(--radius-xs) border border-line-strong text-text-muted hover:text-text hover:border-(--cykan)/40 transition-colors disabled:opacity-40"
        >
          reset
        </button>
        <button
          type="button"
          onClick={onPlayToggle}
          disabled={disabled}
          className="px-(--space-3) py-(--space-1) rounded-(--radius-xs) border border-(--cykan)/40 text-(--cykan) bg-(--cykan)/5 hover:bg-(--cykan)/10 transition-colors disabled:opacity-40"
        >
          {isPlaying ? "pause" : "play"}
        </button>
        <div className="flex items-center gap-(--space-1)">
          {([1, 4, 16] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSpeedChange(s)}
              disabled={disabled}
              className={[
                "t-9 font-mono uppercase tracking-(--tracking-stretch) px-(--space-2) py-(--space-1) rounded-(--radius-xs) border transition-colors",
                s === speed
                  ? "border-(--cykan)/40 text-(--cykan) bg-(--cykan)/5"
                  : "border-line-strong text-text-muted hover:text-text",
              ].join(" ")}
            >
              {s}×
            </button>
          ))}
        </div>
        <span className="ml-auto t-9 font-mono tracking-(--tracking-stretch) text-text-faint tabular-nums">
          {fmt(progress * totalMs)} / {fmt(totalMs)}
        </span>
      </div>
    </div>
  );
}
