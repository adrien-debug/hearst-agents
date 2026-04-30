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
 * Refonte 2026-04-30 : header unifié via <StageActionBar /> — actions
 * cohérentes (Re-run, Éditer, Exporter, Partager, overflow). Delete
 * passe par <ConfirmModal /> et redirige back après succès.
 */

import { useEffect, useState } from "react";
import { useStageStore } from "@/stores/stage";
import { useStageData } from "@/stores/stage-data";
import { ReportLayout } from "../ReportLayout";
import { AssetVariantTabs } from "../AssetVariantTabs";
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

export function AssetStage({ assetId, variantKind }: AssetStageProps) {
  const back = useStageStore((s) => s.back);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [primaryImageUrl, setPrimaryImageUrl] = useState<string | null>(null);

  // Poll les variants pour détecter qu'un variant image est ready et l'afficher
  // en hero directement (pas planqué dans un tab). Polling 4s tant que pending,
  // arrête au premier ready.
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
        const imageReady = data.variants?.find(
          (v) => v.kind === "image" && v.status === "ready" && v.storageUrl,
        );
        if (imageReady?.storageUrl && !cancelled) {
          setPrimaryImageUrl(imageReady.storageUrl);
          if (interval) clearInterval(interval);
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

  const handleEdit = () => {
    // L'édition fine vit dans <ReportLayout /> via spec/onSpecChange.
    // Sans spec à ce niveau, on pousse un toast pour signaler que
    // l'édition se fait dans le panneau du report.
    flash("Utilise le bouton Éditer du rapport pour modifier les blocs");
  };

  const handleDuplicate = () => flash("Dupliquer · pas encore implémenté");
  const handleVersions = () => flash("Versions disponibles dans le rapport");

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
    { id: "edit", label: "Éditer", onClick: handleEdit, disabled: !asset || loading },
    { id: "export", label: "Exporter PDF", onClick: handleExport, disabled: !asset || loading },
    { id: "share", label: "Partager", onClick: handleShare, disabled: !asset || loading },
  ];
  const overflow: StageAction[] = [
    { id: "duplicate", label: "Dupliquer", onClick: handleDuplicate },
    { id: "versions", label: "Versions", onClick: handleVersions },
    {
      id: "delete",
      label: "Supprimer",
      variant: "danger",
      onClick: () => setConfirmDelete(true),
    },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ background: "var(--bg-center)" }}>
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

              {/* Hero image : si l'asset a un variant image ready, on l'affiche
                  en grand directement (pas dans un tab caché). Cliquable pour
                  ouvrir l'original en plein écran. */}
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
              ) : null}

              {/* Body texte : seulement si contentRef non vide. Les assets
                  image-only (placeholder vide) sautent ce bloc. */}
              {asset.contentRef && asset.contentRef.length > 0 ? (
                <AssetBody contentRef={asset.contentRef} title={asset.title} />
              ) : null}

              <AssetVariantTabs
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
