"use client";

/**
 * AudioPlayer — Lecteur minimal pour les variants audio (TTS ElevenLabs).
 *
 * Phase B.1 : un simple <audio controls> avec header status + métadonnées
 * (durée, voix, modèle). Phase B.1bis : waveform visuelle + scrub timeline
 * + chapter markers.
 */

import type { AssetVariant } from "@/lib/assets/variants";

interface AudioPlayerProps {
  variant: AssetVariant;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function AudioPlayer({ variant }: AudioPlayerProps) {
  const isReady = variant.status === "ready" && !!variant.storageUrl;
  const isFailed = variant.status === "failed";

  const meta = (variant.metadata ?? {}) as { voice?: string; model?: string; chars?: number };

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
            {isReady ? "Audio prêt" : isFailed ? "Échec" : "Génération…"}
          </span>
        </div>
        <div className="flex items-center gap-4 t-11 font-light text-[var(--text-faint)]">
          {meta.voice && <span>Voix · {meta.voice.slice(0, 8)}</span>}
          {meta.model && <span>Modèle · {meta.model.replace("eleven_", "")}</span>}
          <span className="font-mono tabular-nums">{formatBytes(variant.sizeBytes)}</span>
        </div>
      </header>

      {isReady && variant.storageUrl ? (
        <audio controls className="w-full" preload="metadata" src={variant.storageUrl}>
          {"Votre navigateur ne supporte pas l'audio HTML5."}
        </audio>
      ) : isFailed ? (
        <p className="t-13 text-[var(--danger)]">{variant.error ?? "Génération échouée"}</p>
      ) : (
        <p className="t-13 font-light text-[var(--text-muted)]">
          {"Synthèse en cours via ElevenLabs… L'audio apparaîtra ici dès qu'il sera prêt."}
        </p>
      )}
    </div>
  );
}
