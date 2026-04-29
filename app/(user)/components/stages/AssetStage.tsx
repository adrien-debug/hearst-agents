"use client";

/**
 * AssetStage — Surface plein écran d'un asset persisté.
 *
 * Refonte 2026-04-29 : standalone, plus de délégation au composant
 * FocalStage embedded. Avant : AssetStage rendait son propre header +
 * mappait l'asset vers un FocalObject minimal + écrivait dans
 * useFocalStore + déléguait à <FocalStage /> qui re-fetchait l'asset
 * via useEffect. Triple rendu (header AssetStage + h1 FocalContent +
 * AgentActivityStrip orphelin du chat précédent), double fetch
 * concurrent, contenu réel jamais affiché à cause du mapping FocalObject
 * incomplet (pas de body/summary/sections hydratés).
 *
 * Désormais : un fetch /api/v2/assets/[id], parse via les helpers
 * lib/assets/content-parser (ReportLayout JSON / HTML iframe / plain
 * text), rend directement. Pas de bridge useFocalStore.
 */

import { useEffect, useState } from "react";
import { useStageStore } from "@/stores/stage";
import { ReportLayout } from "../ReportLayout";
import { AssetVariantTabs } from "../AssetVariantTabs";
import { isHtmlContent, tryParseReportPayload } from "@/lib/assets/content-parser";
import type { Asset } from "@/lib/assets/types";

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

  useEffect(() => {
    let cancelled = false;
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

  return (
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ background: "var(--bg-center)" }}>
      <header className="flex items-center justify-between px-12 py-6 flex-shrink-0 relative z-10 border-b border-[var(--border-default)]">
        <div className="flex items-center gap-4">
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
        </div>
        <button
          onClick={back}
          className="halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-9 font-mono uppercase tracking-section border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all shrink-0"
          title="Retour"
        >
          <span>Retour</span>
          <span className="opacity-60">⌘⌫</span>
        </button>
      </header>

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

              <AssetBody contentRef={asset.contentRef} title={asset.title} />

              <AssetVariantTabs assetId={asset.id} sourceText={asset.contentRef ?? asset.summary ?? asset.title} />
            </>
          )}
        </div>
      </div>
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

  return (
    <div className="prose prose-invert max-w-none">
      <div className="t-15 leading-[1.7] text-[var(--text-muted)] font-normal whitespace-pre-wrap">
        {contentRef}
      </div>
    </div>
  );
}
