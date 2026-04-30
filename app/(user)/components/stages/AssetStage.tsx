"use client";

/**
 * AssetStage — Surface plein écran d'un asset persisté.
 *
 * Refonte 2026-04-29 : standalone, plus de délégation au composant
 * FocalStage embedded. Avant : AssetStage rendait son propre header +
 * mappait l'asset vers un FocalObject minimal + écrivait dans
 * useFocalStore + déléguait à <FocalStage /> qui re-fetchait l'asset
 * via useEffect. Triple rendu (header AssetStage + h1 FocalContent),
 * double fetch concurrent, contenu réel jamais affiché à cause du
 * mapping FocalObject incomplet (pas de body/summary/sections hydratés).
 *
 * Désormais : un fetch /api/v2/assets/[id], parse via les helpers
 * lib/assets/content-parser (ReportLayout JSON / HTML iframe / plain
 * text), rend directement. Pas de bridge useFocalStore.
 *
 * Refonte 2026-04-30 (Phase 4 — Lot 2) : nettoyage actions.
 *  - Re-run en primary, Exporter PDF + Partager en secondary, Supprimer
 *    en overflow danger. Plus de bouton "Éditer" au niveau Stage —
 *    l'édition vit dans <ReportLayout /> via spec/onSpecChange. Plus
 *    de stubs Duplicate/Versions.
 *  - Polling variants : tracke un imageStatus pour afficher un skeleton
 *    pendant la génération et un message d'erreur + bouton re-générer
 *    en cas d'échec.
 *  - Mode image-only : mini-header ajoute le titre tronqué à droite du
 *    bouton retour (avant : back seul, page anonyme).
 */

import { useEffect, useState } from "react";
import { useStageStore } from "@/stores/stage";
import { useStageData } from "@/stores/stage-data";
import { useOfflineStatus } from "../use-offline-status";
import { ReportLayout } from "../ReportLayout";
import { VariantCarousel } from "../VariantCarousel";
import { AssetLineage } from "../AssetLineage";
import { isHtmlContent, tryParseReportPayload } from "@/lib/assets/content-parser";
import { ResearchReportArticle } from "../reports/ResearchReportArticle";
import { StageActionBar, type StageAction } from "./StageActionBar";
import { ConfirmModal } from "../ConfirmModal";
import type { Asset } from "@/lib/assets/types";
import { isPlaceholderAssetId } from "@/lib/ui/asset-id";

interface AssetStageProps {
  assetId: string;
  variantKind?: string;
}

const FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  // Stable serveur ↔ client : évite hydration mismatch SSR (UTC) vs client
  // (timezone locale).
  timeZone: "Europe/Paris",
});

type ImageStatus = "idle" | "pending" | "ready" | "failed";

export function AssetStage({ assetId, variantKind }: AssetStageProps) {
  const back = useStageStore((s) => s.back);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [primaryImageUrl, setPrimaryImageUrl] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState<ImageStatus>("idle");
  const { isOnline } = useOfflineStatus();

  // Poll les variants image. Tracke quatre états :
  //   - idle    : aucun variant image attendu (asset texte pur, ou pas encore décidé)
  //   - pending : un variant image existe en pending/generating → skeleton
  //   - ready   : variant image disponible → hero affiché
  //   - failed  : tentative échouée → message d'erreur + bouton re-générer
  // Stop le polling dès qu'on est ready ou failed.
  useEffect(() => {
    if (!assetId || isPlaceholderAssetId(assetId)) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const fetchVariants = async () => {
      try {
        const res = await fetch(
          `/api/v2/assets/${encodeURIComponent(assetId)}/variants`,
          { credentials: "include" },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          variants?: Array<{ kind: string; status: string; storageUrl?: string | null }>;
        };
        const imageVariants = (data.variants ?? []).filter((v) => v.kind === "image");
        const imageReady = imageVariants.find(
          (v) => v.status === "ready" && v.storageUrl,
        );
        const imagePending = imageVariants.find(
          (v) => v.status === "pending" || v.status === "generating",
        );
        const imageFailed = imageVariants.find((v) => v.status === "failed");

        if (cancelled) return;

        if (imageReady?.storageUrl) {
          setPrimaryImageUrl(imageReady.storageUrl);
          setImageStatus("ready");
          if (interval) clearInterval(interval);
        } else if (imageFailed) {
          setImageStatus("failed");
          if (interval) clearInterval(interval);
        } else if (imagePending) {
          setImageStatus("pending");
        }
      } catch {
        // Silent — l'absence de variant ready ne casse rien.
      }
    };

    void fetchVariants();
    interval = setInterval(fetchVariants, 4000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [assetId]);

  // Sync vers stage-data pour ContextRailForAsset (titre + assetId).
  // Les variants sont écrits par AssetVariantTabs séparément — on lit la
  // valeur courante via getState() pour ne pas les écraser.
  const setAssetSlice = useStageData((s) => s.setAsset);
  useEffect(() => {
    if (asset) {
      setAssetSlice({
        assetId,
        assetTitle: asset.title,
        assetSummary: asset.summary,
        assetCreatedAt: asset.createdAt,
        assetKind: asset.kind,
        variants: useStageData.getState().asset.variants,
      });
    }
  }, [asset, assetId, setAssetSlice]);

  useEffect(() => {
    let cancelled = false;
    // Guard placeholder : assetId vide ou fixture (preset catalogue,
    // mock e2e, cache périmé) → on n'essaie pas de fetch ni de poll
    // les variants. Affiche un état error explicite.
    if (isPlaceholderAssetId(assetId)) {
      // Defer le set d'état error pour ne pas violer
      // react-hooks/set-state-in-effect (sync setState dans effect).
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setLoading(false);
        setError("Asset introuvable");
        setAsset(null);
      });
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset intentionnel avant fetch : nécessaire pour afficher le loading au changement d'assetId
    setLoading(true);
    setError(null);
    fetch(`/api/v2/assets/${encodeURIComponent(assetId)}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (!data?.asset) {
          setError("Asset introuvable");
          setAsset(null);
        } else {
          setAsset(data.asset as Asset);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erreur de chargement");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  const flash = (msg: string) => {
    setActionMsg(msg);
    window.setTimeout(() => setActionMsg(null), 3000);
  };

  const handleRerun = () => {
    // POST /api/reports/[id]/rerun (stub) — fallback toast si non
    // implémenté. La requête réelle reste en best-effort, l'utilisateur
    // récupère un retour visuel quoi qu'il arrive.
    void fetch(`/api/reports/${encodeURIComponent(assetId)}/rerun`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (r) => {
        if (r.status === 404) {
          flash("Re-run non disponible pour cet asset");
          return;
        }
        if (!r.ok) {
          flash(`Erreur Re-run · HTTP ${r.status}`);
          return;
        }
        flash("Re-run lancé");
      })
      .catch(() => flash("Re-run injoignable"));
  };

  const handleExport = () => {
    const url = `/api/reports/${encodeURIComponent(assetId)}/export?format=pdf`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${asset?.title ?? "report"}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleShare = () => {
    void fetch(`/api/reports/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ assetId, ttlHours: 168 }),
    })
      .then(async (r) => {
        if (!r.ok) {
          flash(`Erreur partage · HTTP ${r.status}`);
          return;
        }
        const json = (await r.json()) as { shareUrl?: string };
        if (json.shareUrl) {
          await navigator.clipboard?.writeText(json.shareUrl);
          flash("Lien copié dans le presse-papiers");
        }
      })
      .catch(() => flash("Partage injoignable"));
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const r = await fetch(`/api/v2/assets/${encodeURIComponent(assetId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        flash(`Erreur suppression · HTTP ${r.status}`);
        return;
      }
      setConfirmDelete(false);
      back();
    } finally {
      setDeleting(false);
    }
  };

  const primary: StageAction = {
    id: "rerun",
    label: "Re-run",
    onClick: handleRerun,
    disabled: !asset || loading,
  };
  const secondary: StageAction[] = [
    { id: "export", label: "Exporter PDF", onClick: handleExport, disabled: !asset || loading },
    { id: "share", label: "Partager", onClick: handleShare, disabled: !asset || loading },
  ];
  const overflow: StageAction[] = [
    {
      id: "delete",
      label: "Supprimer",
      variant: "danger",
      onClick: () => setConfirmDelete(true),
    },
  ];

  // Image-only : asset placeholder (contentRef vide) + variant image ready.
  // Mode épuré : pas de header massif, pas de h1 redondant, pas de tabs.
  // Tous les détails (titre, prompt, date, dimensions, modèle, actions)
  // vivent dans le ContextRail droit. Le centre = juste l'image.
  const isImageOnly = !!primaryImageUrl && (!asset?.contentRef || asset.contentRef.length === 0);

  // Indique si on attend un variant image (skeleton à afficher dans le hero).
  // Vrai dès qu'on a un asset placeholder (contentRef vide) et qu'aucune image
  // n'est encore ready/failed — pour éviter de laisser un blanc.
  const showImageSkeleton =
    imageStatus === "pending" &&
    !primaryImageUrl &&
    (!asset?.contentRef || asset.contentRef.length === 0);

  const showImageFailed =
    imageStatus === "failed" &&
    !primaryImageUrl &&
    (!asset?.contentRef || asset.contentRef.length === 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ background: "var(--bg-center)" }}>
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          data-testid="asset-offline-banner"
          className="flex items-center justify-center"
          style={{
            padding: "var(--space-2) var(--space-4)",
            background: "var(--cykan-surface)",
            borderBottom: "1px solid var(--cykan-border)",
            gap: "var(--space-2)",
          }}
        >
          <span
            className="rounded-pill"
            style={{
              width: "var(--space-1)",
              height: "var(--space-1)",
              background: "var(--cykan)",
            }}
          />
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">
            {asset
              ? "Mode hors ligne — affichage cache"
              : "Hors ligne — connecte-toi pour voir cet asset"}
          </span>
        </div>
      )}
      {isImageOnly ? (
        // Mini header : back + titre tronqué (actions déportées au rail droit
        // pour les images, mais le titre reste visible pour ne pas se sentir
        // perdu sur un Stage anonyme).
        <div
          className="flex items-center"
          style={{
            padding: "var(--space-4) var(--space-6)",
            borderBottom: "1px solid var(--border-shell)",
            gap: "var(--space-4)",
          }}
        >
          <button
            type="button"
            onClick={back}
            className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors shrink-0"
            style={{ background: "transparent", border: "none", cursor: "pointer" }}
            aria-label="Retour"
          >
            ← Retour <span className="opacity-60">⌘⌫</span>
          </button>
          {asset?.title && (
            <span
              className="t-9 font-mono uppercase tracking-marquee text-[var(--text-muted)] truncate"
              title={asset.title}
            >
              {asset.title}
            </span>
          )}
        </div>
      ) : (
        <StageActionBar
          context={
            <>
              <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">ASSET</span>
              <span className="rounded-pill bg-[var(--text-ghost)]" style={{ width: "var(--space-1)", height: "var(--space-1)" }} />
              <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-muted)]">{assetId.slice(0, 8)}</span>
              {asset && (
                <>
                  <span className="rounded-pill bg-[var(--text-ghost)]" style={{ width: "var(--space-1)", height: "var(--space-1)" }} />
                  <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">{asset.kind}</span>
                </>
              )}
              {variantKind && (
                <>
                  <span className="rounded-pill bg-[var(--text-ghost)]" style={{ width: "var(--space-1)", height: "var(--space-1)" }} />
                  <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">{variantKind}</span>
                </>
              )}
            </>
          }
          primary={primary}
          secondary={secondary}
          overflow={overflow}
          onBack={back}
        />
      )}

      {actionMsg && (
        <div
          role="status"
          aria-live="polite"
          data-testid="asset-stage-toast"
          className="flex items-center"
          style={{
            position: "absolute",
            top: "calc(var(--space-16) + var(--space-2))",
            right: "var(--space-12)",
            zIndex: 20,
            padding: "var(--space-2) var(--space-4)",
            background: "var(--surface-1)",
            border: "1px solid var(--cykan)",
            borderRadius: "var(--radius-xs)",
            color: "var(--cykan)",
            gap: "var(--space-2)",
          }}
        >
          <span className="t-9 font-mono uppercase tracking-display">{actionMsg}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-12 py-12 min-h-full">
          {loading && (
            <div className="flex flex-col items-center justify-center py-24" style={{ rowGap: "var(--space-4)" }}>
              <span
                className="rounded-pill bg-[var(--cykan)] animate-pulse halo-cyan-sm"
                style={{ width: "var(--space-2)", height: "var(--space-2)" }}
                aria-hidden
              />
              <p className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">{"Chargement de l'asset…"}</p>
            </div>
          )}

          {error && !loading && (
            <div className="border-l-2 border-[var(--danger)] bg-[var(--danger)]/5 px-4 py-3">
              <p className="t-9 font-mono uppercase tracking-marquee text-[var(--danger)]">ERREUR · {error}</p>
            </div>
          )}

          {asset && !loading && (
            <>
              {/* Titre + meta : seulement pour les rapports texte. En mode
                  image-only, ces infos vivent dans le ContextRail droit. */}
              {!isImageOnly && (
                <>
                  {/* Lineage / provenance — toujours visible en haut pour rappeler
                      d'où vient l'asset (mission, run, modèle, sources). */}
                  <AssetLineage
                    asset={asset}
                    onOpenParent={(parentId) =>
                      useStageStore.getState().setMode({ mode: "asset", assetId: parentId })
                    }
                  />
                  <h1
                    className="t-28 font-medium tracking-tight text-[var(--text)]"
                    style={{ lineHeight: "var(--leading-snug)", marginBottom: "var(--space-3)" }}
                  >
                    {asset.title}
                  </h1>

                  <div className="flex items-center gap-3 mb-10 t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
                    <span>{asset.kind}</span>
                    <span className="rounded-pill bg-[var(--text-ghost)]" style={{ width: "var(--space-1)", height: "var(--space-1)" }} />
                    <span>{FORMATTER.format(new Date(asset.createdAt))}</span>
                    {asset.summary && (
                      <>
                        <span className="rounded-pill bg-[var(--text-ghost)]" style={{ width: "var(--space-1)", height: "var(--space-1)" }} />
                        <span className="normal-case tracking-normal font-sans text-[var(--text-muted)] truncate">{asset.summary}</span>
                      </>
                    )}
                  </div>
                </>
              )}

              {/* Hero image : si l'asset a un variant image ready, on l'affiche
                  en grand directement (pas dans un tab caché). Cliquable pour
                  ouvrir l'original en plein écran. Sinon, skeleton pendant la
                  génération ou message d'erreur si elle a échoué. */}
              {primaryImageUrl ? (
                <a
                  href={primaryImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full mb-10"
                  style={{
                    border: "1px solid var(--border-shell)",
                    borderRadius: "var(--radius-md)",
                    overflow: "hidden",
                    background: "var(--surface-1)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- image storage URL dynamique, pas optimizable */}
                  <img
                    src={primaryImageUrl}
                    alt={asset.title}
                    className="w-full h-auto block"
                  />
                </a>
              ) : showImageSkeleton ? (
                <div
                  data-testid="asset-image-skeleton"
                  className="block w-full mb-10 aspect-square animate-pulse"
                  style={{
                    border: "1px solid var(--border-shell)",
                    borderRadius: "var(--radius-md)",
                    background:
                      "linear-gradient(135deg, var(--surface-1), var(--cykan-soft, var(--surface-2)))",
                  }}
                  aria-label="Génération de l'image en cours"
                />
              ) : showImageFailed ? (
                <div
                  data-testid="asset-image-failed"
                  className="flex flex-col items-start mb-10"
                  style={{
                    gap: "var(--space-4)",
                    padding: "var(--space-6)",
                    border: "1px solid var(--danger)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--surface-1)",
                  }}
                >
                  <p className="t-9 font-mono uppercase tracking-marquee text-[var(--danger)]">
                    Échec de la génération d&apos;image
                  </p>
                  <p className="t-13 font-light text-[var(--text-muted)]">
                    La génération a échoué. Tu peux relancer une nouvelle
                    tentative.
                  </p>
                  <button
                    type="button"
                    onClick={handleRerun}
                    className="halo-on-hover inline-flex items-center t-9 font-mono uppercase tracking-section"
                    style={{
                      gap: "var(--space-2)",
                      paddingLeft: "var(--space-3)",
                      paddingRight: "var(--space-3)",
                      paddingTop: "var(--space-1)",
                      paddingBottom: "var(--space-1)",
                      background: "var(--cykan)",
                      color: "var(--bg-center)",
                      border: "1px solid var(--cykan)",
                      borderRadius: "var(--radius-xs)",
                      cursor: "pointer",
                    }}
                  >
                    Re-générer
                  </button>
                </div>
              ) : null}

              {/* Body texte : seulement si contentRef non vide. Les assets
                  image-only (placeholder vide) sautent ce bloc. */}
              {asset.contentRef && asset.contentRef.length > 0 ? (
                <AssetBody contentRef={asset.contentRef} title={asset.title} />
              ) : null}

              {/* VariantCarousel : carrousel visuel des variants alternatifs
                  (audio, vidéo, image, code). Remplace AssetVariantTabs (B4).
                  Affiché uniquement pour les assets texte/rapport — une image
                  pure générée par generate_image n'a pas de sens à proposer
                  "audio narration" ou "code". */}
              {asset.contentRef && asset.contentRef.length > 0 ? (
                <VariantCarousel
                  assetId={asset.id}
                  sourceText={asset.contentRef ?? asset.summary ?? asset.title}
                  defaultKind={
                    (variantKind === "audio" ||
                    variantKind === "video" ||
                    variantKind === "image" ||
                    variantKind === "code"
                      ? variantKind
                      : undefined) as "audio" | "video" | "image" | "code" | undefined
                  }
                />
              ) : null}
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmDelete}
        title="Supprimer cet asset ?"
        description={`L'asset « ${asset?.title ?? assetId.slice(0, 8)} » sera supprimé définitivement. Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="danger"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

/**
 * AssetBody — Sélectionne le rendu en fonction du format détecté.
 * Trois branches via les helpers `tryParseReportPayload` / `isHtmlContent` :
 *   1. ReportPayload JSON → <ReportLayout> (grille blocs structurés)
 *   2. HTML → <iframe sandbox> (rapports HTML générés)
 *   3. Plain text / markdown → div avec wrap (briefs free-form)
 */
function AssetBody({ contentRef, title }: { contentRef?: string; title: string }) {
  if (!contentRef) {
    return (
      <p className="t-13 font-light text-[var(--text-muted)]">
        Aucun contenu disponible pour cet asset.
      </p>
    );
  }

  const reportPayload = tryParseReportPayload(contentRef);
  if (reportPayload) {
    return <ReportLayout payload={reportPayload} />;
  }

  if (isHtmlContent(contentRef)) {
    return (
      <iframe
        title={title}
        srcDoc={contentRef}
        sandbox="allow-same-origin"
        className="w-full rounded-sm border border-[var(--surface-2)] bg-white"
        style={{ height: "var(--space-32)", minHeight: "var(--height-focal-min)" }}
      />
    );
  }

  return <ResearchReportArticle content={contentRef} />;
}
