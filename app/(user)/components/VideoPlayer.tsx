"use client";

import type { AssetVariant } from "@/lib/assets/variants";

interface VideoPlayerProps {
  variant: AssetVariant;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VideoPlayer({ variant }: VideoPlayerProps) {
  const isReady = variant.status === "ready" && !!variant.storageUrl;
  const isFailed = variant.status === "failed";
  const meta = (variant.metadata ?? {}) as { provider?: string; duration?: number };

  return (
    <div className="border border-[var(--surface-2)] rounded-md bg-[var(--surface-1)] p-6">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span
            className={`rounded-pill ${
              isReady ? "bg-[var(--cykan)] halo-cyan-sm" : isFailed ? "bg-[var(--danger)]" : "bg-[var(--warn)] animate-pulse"
            }`}
            style={{ width: "var(--space-2)", height: "var(--space-2)" }}
            aria-hidden
          />
          <span
            className={`t-9 font-mono uppercase tracking-marquee ${
              isReady ? "text-[var(--cykan)]" : isFailed ? "text-[var(--danger)]" : "text-[var(--warn)]"
            }`}
          >
            {isReady ? "VIDEO_READY" : isFailed ? "VIDEO_FAILED" : "GENERATING"}
          </span>
        </div>
        <div className="flex items-center gap-4 t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
          {meta.provider && <span>PROVIDER: {meta.provider.toUpperCase()}</span>}
          {meta.duration !== undefined && <span>DUR: {formatDuration(meta.duration)}</span>}
        </div>
      </header>

      {isReady && variant.storageUrl ? (
        <video
          controls
          preload="metadata"
          src={variant.storageUrl}
          className="w-full rounded-sm border border-[var(--border-shell)]"
        />
      ) : isFailed ? (
        <p className="t-13 text-[var(--danger)]">{variant.error ?? "Génération échouée"}</p>
      ) : (
        <p className="t-13 font-light text-[var(--text-muted)]">
          Génération en cours via HeyGen/Runway…
        </p>
      )}
    </div>
  );
}
