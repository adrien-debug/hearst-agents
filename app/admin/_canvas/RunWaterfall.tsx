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
  progress: number;
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
      <div
        role="slider"
        aria-label="Timeline du run"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        tabIndex={0}
        className="relative h-(--space-6) rounded-(--radius-xs) bg-(--surface)/40 cursor-pointer overflow-hidden focus-visible:ring-1 focus-visible:ring-(--cykan)/50 outline-none"
        onClick={(e) => {
          if (disabled) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          onSeek(Math.max(0, Math.min(1, ratio)));
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowLeft") onSeek(Math.max(0, progress - 0.05));
          if (e.key === "ArrowRight") onSeek(Math.min(1, progress + 0.05));
          if (e.key === "Home") onSeek(0);
          if (e.key === "End") onSeek(1);
          if (e.key === " ") {
            e.preventDefault();
            onPlayToggle();
          }
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
                className="absolute top-1/2 -translate-y-1/2 h-(--space-4) rounded-(--radius-xs) border transition-[filter,transform] duration-(--duration-base) ease-(--ease-standard) hover:brightness-110 motion-safe:hover:scale-y-110"
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
        <div
          aria-hidden
          className="admin-waterfall-playhead absolute top-0 bottom-0 w-px bg-(--cykan) pointer-events-none"
          style={{ left: `${Math.min(Math.max(progress, 0), 1) * 100}%` }}
        />
      </div>

      <div className="flex items-center gap-(--space-3) t-10 font-mono uppercase tracking-(--tracking-wide)">
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          className="px-(--space-2) py-(--space-1) rounded-(--radius-xs) border border-line-strong text-text-muted hover:text-text hover:border-(--cykan)/40 transition-colors duration-(--duration-base) ease-(--ease-standard) disabled:opacity-40"
        >
          reset
        </button>
        <button
          type="button"
          onClick={onPlayToggle}
          disabled={disabled}
          className="px-(--space-3) py-(--space-1) rounded-(--radius-xs) border border-(--cykan)/40 text-(--cykan) bg-(--cykan)/5 hover:bg-(--cykan)/10 transition-colors duration-(--duration-base) ease-(--ease-standard) disabled:opacity-40"
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
                "t-9 font-mono uppercase tracking-(--tracking-stretch) px-(--space-2) py-(--space-1) rounded-(--radius-xs) border transition-colors duration-(--duration-base) ease-(--ease-standard) disabled:opacity-40",
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
