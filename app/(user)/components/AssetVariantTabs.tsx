"use client";

/**
 * AssetVariantTabs — Onglets multi-format dans la FocalStage.
 *
 * Pivot 2026-04-29 : un asset (rapport texte) peut avoir des variants
 * audio / vidéo / slides / site générés à la demande. Cet onglet montre
 * les variants existants et propose la génération via bouton CTA.
 *
 * Phase B.1 : audio uniquement (ElevenLabs TTS). Phase B suivante : video
 * (HeyGen + Runway), slides, site.
 *
 * Polling : tant qu'un variant est `pending` ou `generating`, on poll
 * /api/v2/assets/[id]/variants toutes les 4s. Phase B suivante : remplacer
 * par SSE /api/v2/jobs/[id]/progress.
 */

import { useCallback, useEffect, useState } from "react";
import { AudioPlayer } from "./AudioPlayer";
import type { AssetVariant, AssetVariantKind } from "@/lib/assets/variants";

interface AssetVariantTabsProps {
  assetId: string;
  /** Texte source à synthétiser (par défaut : asset content). */
  sourceText?: string;
}

const TABS: ReadonlyArray<{ kind: AssetVariantKind; label: string; available: boolean }> = [
  { kind: "text", label: "Texte", available: true },
  { kind: "audio", label: "Audio", available: true },
  { kind: "video", label: "Vidéo", available: false },
  { kind: "slides", label: "Slides", available: false },
  { kind: "site", label: "Site", available: false },
];

const POLL_INTERVAL_MS = 4_000;

export function AssetVariantTabs({ assetId, sourceText }: AssetVariantTabsProps) {
  const [activeTab, setActiveTab] = useState<AssetVariantKind>("text");
  const [variants, setVariants] = useState<AssetVariant[]>([]);
  const [generating, setGenerating] = useState<AssetVariantKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioVariant = variants.find((v) => v.kind === "audio");

  const fetchVariants = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/assets/${encodeURIComponent(assetId)}/variants`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.variants)) setVariants(data.variants as AssetVariant[]);
    } catch (_err) {
      // Non-fatal — on retry au prochain poll.
    }
  }, [assetId]);

  // Initial fetch
  useEffect(() => {
    void fetchVariants();
  }, [fetchVariants]);

  // Polling tant qu'un variant est en cours
  useEffect(() => {
    const hasInProgress = variants.some(
      (v) => v.status === "pending" || v.status === "generating",
    );
    if (!hasInProgress) return;

    const timer = setInterval(() => {
      void fetchVariants();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [variants, fetchVariants]);

  const requestVariant = useCallback(
    async (kind: AssetVariantKind) => {
      if (kind !== "audio") return;
      setGenerating(kind);
      setError(null);
      try {
        const res = await fetch(`/api/v2/assets/${encodeURIComponent(assetId)}/variants`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, text: sourceText }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message || data.error || "Échec de la génération");
          return;
        }
        await fetchVariants();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur réseau");
      } finally {
        setGenerating(null);
      }
    },
    [assetId, sourceText, fetchVariants],
  );

  return (
    <div className="border-t border-[var(--surface-2)] pt-8">
      <header className="flex items-center justify-between mb-6">
        <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">VARIANTS</span>
        <div className="flex items-center gap-2">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.kind;
            const variant = variants.find((v) => v.kind === tab.kind);
            const dotColor =
              variant?.status === "ready"
                ? "bg-[var(--cykan)] halo-cyan-sm"
                : variant?.status === "pending" || variant?.status === "generating"
                ? "bg-[var(--warn)] animate-pulse"
                : variant?.status === "failed"
                ? "bg-[var(--danger)]"
                : "bg-[var(--text-ghost)]";
            return (
              <button
                key={tab.kind}
                type="button"
                onClick={() => tab.available && setActiveTab(tab.kind)}
                disabled={!tab.available}
                className={`halo-on-hover px-3 py-1.5 t-9 font-mono uppercase tracking-marquee border transition-all ${
                  isActive
                    ? "border-[var(--cykan)] text-[var(--cykan)] halo-cyan-sm"
                    : tab.available
                    ? "border-[var(--border-shell)] text-[var(--text-muted)] hover:text-[var(--text)]"
                    : "border-[var(--surface-2)] text-[var(--text-ghost)] cursor-not-allowed"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`rounded-pill shrink-0 ${dotColor}`} style={{ width: "var(--space-1)", height: "var(--space-1)" }} />
                  <span>{tab.label}</span>
                  {!tab.available && <span className="opacity-50">SOON</span>}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {activeTab === "text" && (
        <p className="t-11 font-mono tracking-display uppercase text-[var(--text-ghost)]">
          Variant texte = contenu principal de l'asset (déjà affiché ci-dessus).
        </p>
      )}

      {activeTab === "audio" && (
        <div>
          {audioVariant ? (
            <AudioPlayer variant={audioVariant} />
          ) : (
            <div className="flex flex-col items-start gap-4">
              <p className="t-13 font-light text-[var(--text-muted)]">
                Aucun variant audio. Génère un fichier audio narré à partir du texte de cet asset (ElevenLabs TTS).
              </p>
              <button
                type="button"
                onClick={() => void requestVariant("audio")}
                disabled={generating === "audio"}
                className="halo-on-hover px-6 py-3 t-9 font-mono uppercase tracking-marquee bg-[var(--cykan)] text-[var(--bg)] hover:tracking-[0.4em] transition-all duration-slow disabled:opacity-60"
              >
                {generating === "audio" ? "Création…" : "Générer l'audio"}
              </button>
              {error && (
                <p className="t-11 font-mono uppercase tracking-display text-[var(--danger)]">{error}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
