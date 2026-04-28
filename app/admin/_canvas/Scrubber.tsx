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
      <div className="flex items-center justify-between gap-(--space-4) px-(--space-4) py-(--space-2) border-t border-line bg-bg-elev t-10 font-mono uppercase tracking-(--tracking-label) text-text-faint">
        Sélectionne un run pour rejouer
      </div>
    );
  }

  return (
    <div className="flex items-center gap-(--space-3) px-(--space-4) py-(--space-2) border-t border-line bg-bg-elev">
      <button
        type="button"
        onClick={onReset}
        disabled={disabled}
        className="t-10 font-mono uppercase tracking-(--tracking-wide) px-(--space-2) py-(--space-1) rounded-(--radius-xs) border border-line-strong text-text-muted hover:text-text hover:border-(--cykan)/40 transition-colors disabled:opacity-40"
      >
        reset
      </button>

      <button
        type="button"
        onClick={onPlayToggle}
        disabled={disabled}
        className="t-10 font-mono uppercase tracking-(--tracking-wide) px-(--space-3) py-(--space-1) rounded-(--radius-xs) border border-(--cykan)/40 text-(--cykan) bg-(--cykan)/5 hover:bg-(--cykan)/10 transition-colors disabled:opacity-40"
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

      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(progress * 1000)}
        onChange={(e) => onSeek(parseInt(e.target.value, 10) / 1000)}
        disabled={disabled}
        className="flex-1 accent-(--cykan) h-(--space-1)"
      />

      <span className="t-9 font-mono tracking-(--tracking-stretch) text-text-faint">
        {Math.round(progress * 100)}%
      </span>
    </div>
  );
}
