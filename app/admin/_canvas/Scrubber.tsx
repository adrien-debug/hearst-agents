"use client";

import { useCanvasStore } from "./store";

interface Props {
  isPlaying: boolean;
  progress: number; // 0-1
  speed: 1 | 4 | 16;
  onPlayToggle: () => void;
  onSpeedChange: (s: 1 | 4 | 16) => void;
  onReset: () => void;
  onSeek: (progress: number) => void;
  disabled?: boolean;
}

export default function Scrubber({
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

  if (!selectedRunId) {
    return (
      <div className="flex items-center justify-between gap-4 px-4 py-2 border-t border-[var(--line)] bg-[var(--bg-elev)] t-10 font-mono uppercase tracking-[0.15em] text-[var(--text-faint)]">
        Sélectionne un run pour rejouer
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--line)] bg-[var(--bg-elev)]">
      <button
        type="button"
        onClick={onReset}
        disabled={disabled}
        className="t-10 font-mono uppercase tracking-[0.12em] px-2 py-1 rounded border border-[var(--line-strong)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--cykan)]/40 transition-colors disabled:opacity-40"
      >
        reset
      </button>

      <button
        type="button"
        onClick={onPlayToggle}
        disabled={disabled}
        className="t-10 font-mono uppercase tracking-[0.12em] px-3 py-1 rounded border border-[var(--cykan)]/40 text-[var(--cykan)] bg-[var(--cykan)]/5 hover:bg-[var(--cykan)]/10 transition-colors disabled:opacity-40"
      >
        {isPlaying ? "pause" : "play"}
      </button>

      <div className="flex items-center gap-1">
        {([1, 4, 16] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeedChange(s)}
            disabled={disabled}
            className={[
              "t-9 font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border transition-colors",
              s === speed
                ? "border-[var(--cykan)]/40 text-[var(--cykan)] bg-[var(--cykan)]/5"
                : "border-[var(--line-strong)] text-[var(--text-muted)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            {s}×
          </button>
        ))}
      </div>

      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(progress * 1000)}
        onChange={(e) => onSeek(parseInt(e.target.value, 10) / 1000)}
        disabled={disabled}
        className="flex-1 accent-[var(--cykan)] h-1"
      />

      <span className="t-9 font-mono tracking-[0.1em] text-[var(--text-faint)]">
        {Math.round(progress * 100)}%
      </span>
    </div>
  );
}
