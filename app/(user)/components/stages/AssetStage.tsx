"use client";

import { useEffect } from "react";
import { useFocalStore } from "@/stores/focal";
import { useStageStore } from "@/stores/stage";
import { FocalStage } from "../FocalStage";
import type { FocalObject } from "@/lib/core/types";
import { mapFocalObject } from "@/lib/core/types/focal";

interface AssetStageProps {
  assetId: string;
  variantKind?: string;
}

/**
 * AssetStage — Stage standalone pour un asset focus avec variants.
 *
 * Différence avec FocalStage embedded dans ChatStage : ici on ouvre un
 * asset depuis la TimelineRail (click sur "Brief de 9h", "Rapport ACME",
 * etc.). L'asset prend tout le centre, pas de chat dessous (mais le
 * ChatInput flottant reste invocable via Cmd+L).
 *
 * V1 (Phase A) : on délègue au composant FocalStage existant. Les
 * variants tabs (texte/audio/vidéo/slides/site) seront ajoutés en Phase B
 * quand les workers sont prêts à générer les variants.
 */
export function AssetStage({ assetId, variantKind }: AssetStageProps) {
  const setFocal = useFocalStore((s) => s.setFocal);
  const back = useStageStore((s) => s.back);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v2/assets/${encodeURIComponent(assetId)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.asset) return;
        // Map asset → focal object pour réutiliser la rendition existante.
        // mapFocalObject gère le shape mismatch (asset → FocalObject).
        const focal = mapFocalObject(
          {
            id: data.asset.id,
            type: data.asset.kind === "report" ? "report" : "doc",
            title: data.asset.title,
            status: "ready",
            sourceAssetId: data.asset.id,
          },
          data.asset.thread_id ?? "",
        );
        if (focal) setFocal(focal as FocalObject);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [assetId, setFocal]);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ background: "var(--bg-center)" }}>
      <div className="flex items-center justify-between px-12 py-6 flex-shrink-0 relative z-10 border-b border-[var(--surface-2)]">
        <div className="flex items-center gap-4">
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">ASSET</span>
          <span className="rounded-pill bg-[var(--text-ghost)]" style={{ width: "var(--space-1)", height: "var(--space-1)" }} />
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-muted)]">{assetId.slice(0, 8)}</span>
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
      </div>
      <div className="flex-1 overflow-y-auto">
        <FocalStage />
      </div>
    </div>
  );
}
