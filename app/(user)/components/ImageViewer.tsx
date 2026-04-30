"use client";

import type { AssetVariant } from "@/lib/assets/variants";

interface ImageViewerProps {
  variant: AssetVariant;
}

export function ImageViewer({ variant }: ImageViewerProps) {
  const isReady = variant.status === "ready" && !!variant.storageUrl;
  const isFailed = variant.status === "failed";
  const meta = (variant.metadata ?? {}) as { model?: string; width?: number; height?: number };

  return (
    <div className="border border-[var(--surface-2)] rounded-md bg-[var(--surface-1)] p-6">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span
            className={`rounded-pill ${
              isReady ? "bg-[var(--cykan)]" : isFailed ? "bg-[var(--danger)]" : "bg-[var(--warn)] animate-pulse"
            }`}
            style={{ width: "var(--space-2)", height: "var(--space-2)" }}
            aria-hidden
          />
          <span
            className={`t-13 font-medium ${
              isReady ? "text-[var(--cykan)]" : isFailed ? "text-[var(--danger)]" : "text-[var(--warn)]"
            }`}
          >
            {isReady ? "Image prête" : isFailed ? "Échec" : "Génération…"}
          </span>
        </div>
        <div className="flex items-center gap-4 t-11 font-light text-[var(--text-faint)]">
          {meta.model && <span>Modèle · {meta.model}</span>}
          {meta.width && meta.height && <span className="font-mono tabular-nums">{meta.width}×{meta.height}</span>}
        </div>
      </header>

      {isReady && variant.storageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={variant.storageUrl}
          alt={variant.id}
          className="w-full rounded-sm border border-[var(--border-shell)]"
          style={{ maxHeight: "var(--space-96)" }}
        />
      ) : isFailed ? (
        <p className="t-13 text-[var(--danger)]">{variant.error ?? "Génération échouée"}</p>
      ) : (
        <p className="t-13 font-light text-[var(--text-muted)]">
          Génération en cours via fal.ai…
        </p>
      )}
    </div>
  );
}
