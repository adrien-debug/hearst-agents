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
import { ImageViewer } from "./ImageViewer";
import { VideoPlayer } from "./VideoPlayer";
import { CodeRunner } from "./CodeRunner";
import { useStageData } from "@/stores/stage-data";
import type { AssetVariant, AssetVariantKind } from "@/lib/assets/variants";

interface AssetVariantTabsProps {
  assetId: string;
  /** Texte source à synthétiser (par défaut : asset content). */
  sourceText?: string;
  /** Tab à activer au mount. Permet à un caller (ex: stage_request avec
   * variantKind="image") de sélectionner directement le bon tab plutôt
   * que le default audio. */
  defaultKind?: AssetVariantKind;
}

// Pas d'onglet "Texte" : le contenu de l'asset EST le variant texte par
// essence (rendu directement par AssetStage / FocalStage). Les onglets
// listent uniquement les formats alternatifs générables à la demande.
//
// Refonte 2026-04-30 (Phase 4 — Lot 2) : on ne liste plus les onglets non
// implémentés (slides, site). Si non disponible, ne pas exposer dans l'UI.
const TABS: ReadonlyArray<{ kind: AssetVariantKind; label: string }> = [
  { kind: "audio",  label: "Audio"  },
  { kind: "video",  label: "Vidéo"  },
  { kind: "image",  label: "Image"  },
  { kind: "code",   label: "Code"   },
];

const POLL_INTERVAL_MS = 4_000;

export function AssetVariantTabs({ assetId, sourceText, defaultKind }: AssetVariantTabsProps) {
  const [activeTab, setActiveTab] = useState<AssetVariantKind>(defaultKind ?? "audio");
  const [variants, setVariants] = useState<AssetVariant[]>([]);
  const [generating, setGenerating] = useState<AssetVariantKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoProvider, setVideoProvider] = useState<"runway" | "heygen">("runway");

  // Sync vers stage-data pour ContextRailForAsset (variants list).
  // currentAsset est lu via getState() pour ne pas re-déclencher l'effect
  // sur chaque changement d'autres champs (assetId/title) — sinon boucle.
  const setAssetSlice = useStageData((s) => s.setAsset);
  useEffect(() => {
    const currentAsset = useStageData.getState().asset;
    setAssetSlice({ ...currentAsset, variants });
  }, [variants, setAssetSlice]);

  const variantFor = (kind: AssetVariantKind) => variants.find((v) => v.kind === kind);

  const fetchVariants = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/assets/${encodeURIComponent(assetId)}/variants`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.variants)) setVariants(data.variants as AssetVariant[]);
    } catch {
      // Non-fatal — on retry au prochain poll.
    }
  }, [assetId]);

  // Initial fetch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchVariants est async : setVariants ne s'appelle qu'après await, pas synchrone
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
      setGenerating(kind);
      setError(null);
      try {
        const requestBody: Record<string, unknown> = { kind };
        if (kind === "video") {
          requestBody.provider = videoProvider;
          requestBody.scriptText = sourceText;
          requestBody.prompt = sourceText;
        } else {
          requestBody.text = sourceText;
        }
        const res = await fetch(`/api/v2/assets/${encodeURIComponent(assetId)}/variants`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
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
    [assetId, sourceText, fetchVariants, videoProvider],
  );

  return (
    <div className="border-t border-[var(--surface-2)] pt-8">
      <header className="flex items-center justify-between mb-6">
        <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">FORMATS ALTERNATIFS</span>
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
                onClick={() => setActiveTab(tab.kind)}
                className={`halo-on-hover px-3 py-1.5 t-9 font-mono uppercase tracking-marquee border transition-all ${
                  isActive
                    ? "border-[var(--cykan)] text-[var(--cykan)] halo-cyan-sm"
                    : "border-[var(--border-shell)] text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`rounded-pill shrink-0 ${dotColor}`} style={{ width: "var(--space-1)", height: "var(--space-1)" }} />
                  <span>{tab.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {(() => {
        const TAB_META: Record<string, { empty: string; cta: string; ctaLoading: string }> = {
          audio: {
            empty: "Aucun variant audio. Génère un fichier audio narré à partir du texte de cet asset (ElevenLabs TTS).",
            cta: "Générer l'audio",
            ctaLoading: "Création…",
          },
          video: {
            empty: "Aucun variant vidéo. Génère une vidéo animée à partir de cet asset (HeyGen / Runway).",
            cta: "Générer la vidéo",
            ctaLoading: "Création…",
          },
          image: {
            empty: "Aucune image générée. Génère une illustration à partir du titre ou du contenu (fal.ai).",
            cta: "Générer l'image",
            ctaLoading: "Création…",
          },
          code: {
            empty: "Aucun résultat d'exécution. Lance le code associé à cet asset dans un sandbox sécurisé (E2B).",
            cta: "Exécuter le code",
            ctaLoading: "Exécution…",
          },
        };

        const meta = TAB_META[activeTab];
        const variant = variantFor(activeTab);

        const renderer = variant ? (
          activeTab === "audio" ? <AudioPlayer variant={variant} /> :
          activeTab === "video" ? <VideoPlayer variant={variant} /> :
          activeTab === "image" ? <ImageViewer variant={variant} /> :
          activeTab === "code"  ? <CodeRunner  variant={variant} /> :
          null
        ) : null;

        if (renderer) return <div>{renderer}</div>;
        if (!meta) return null;

        return (
          <div className="flex flex-col items-start gap-4">
            <p className="t-13 font-light text-[var(--text-muted)]">{meta.empty}</p>
            {activeTab === "video" && (
              <label className="flex flex-col gap-2">
                <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
                  PROVIDER
                </span>
                <select
                  value={videoProvider}
                  onChange={(e) => setVideoProvider(e.target.value === "heygen" ? "heygen" : "runway")}
                  disabled={generating === "video"}
                  className="halo-on-hover px-3 py-2 t-11 font-mono text-[var(--text)] bg-[var(--card-flat-bg)] border border-[var(--border-shell)] hover:border-[var(--cykan-border-hover)] transition-colors disabled:opacity-60"
                >
                  <option value="runway">Runway (text-to-video)</option>
                  <option value="heygen">HeyGen (avatar)</option>
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={() => void requestVariant(activeTab)}
              disabled={generating === activeTab}
              className="halo-on-hover px-6 py-3 t-9 font-mono uppercase tracking-marquee bg-[var(--cykan)] text-[var(--bg)] hover:tracking-[0.4em] transition-all duration-slow disabled:opacity-60"
            >
              {generating === activeTab ? meta.ctaLoading : meta.cta}
            </button>
            {error && (
              <p className="t-11 font-mono uppercase tracking-display text-[var(--danger)]">{error}</p>
            )}
          </div>
        );
      })()}
    </div>
  );
}
