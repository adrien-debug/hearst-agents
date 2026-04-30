"use client";

/**
 * PreviewPane — preview live du spec en cours d'édition.
 *
 * Stratégie minimale V1 : on construit un RenderPayload local depuis les blocks
 * + props inline visibles. Aucun fetch tant que le spec n'est pas sauvegardé
 * (run sample côté Studio se fait via StudioToolbar → POST .../run avec
 * sample:true, et le résultat met à jour `samplePayload` ici).
 *
 * Le rendu réutilise <ReportLayout/> pour la fidélité visuelle.
 *
 * Tokens uniquement, conforme CLAUDE.md.
 */

import { useMemo } from "react";
import type { ReportSpec, BlockSpec } from "@/lib/reports/spec/schema";
import type { RenderPayload, RenderedBlock } from "@/lib/reports/engine/render-blocks";
import { ReportLayout } from "@/app/(user)/components/ReportLayout";

export interface PreviewPaneProps {
  spec: ReportSpec;
  /** Payload de sample run (renvoyé par /run avec sample:true). */
  samplePayload?: RenderPayload | null;
  /** True pendant le sample run en cours. */
  isSampling?: boolean;
  /** Erreur du sample run, si applicable. */
  sampleError?: string | null;
}

export function PreviewPane({
  spec,
  samplePayload,
  isSampling,
  sampleError,
}: PreviewPaneProps) {
  const localPayload = useMemo<RenderPayload>(
    () => buildLocalPreviewPayload(spec),
    [spec],
  );

  const payloadToRender: RenderPayload = samplePayload ?? localPayload;
  const visibleBlocks = payloadToRender.blocks;
  const totalBlocks = spec.blocks.length;

  return (
    <main
      data-testid="studio-preview"
      className="flex flex-col h-full overflow-y-auto"
      style={{
        gap: "var(--space-4)",
        padding: "var(--space-6)",
        background: "var(--bg-soft)",
      }}
    >
      <header
        className="flex items-center justify-between"
        style={{ gap: "var(--space-3)" }}
      >
        <div className="flex flex-col" style={{ gap: "var(--space-1)" }}>
          <h1 className="t-15" style={{ color: "var(--text)" }}>
            {spec.meta.title || "Nouveau rapport"}
          </h1>
          {spec.meta.summary && (
            <p className="t-11" style={{ color: "var(--text-faint)" }}>
              {spec.meta.summary}
            </p>
          )}
        </div>
        <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
          <span
            className="t-9 font-mono uppercase"
            style={{
              color: "var(--text-muted)",
              letterSpacing: "var(--tracking-display)",
            }}
          >
            {samplePayload ? "Sample" : "Preview"}
          </span>
          {isSampling && (
            <span
              data-testid="studio-preview-loading"
              className="t-9"
              style={{ color: "var(--cykan)" }}
            >
              ⟳ Run en cours…
            </span>
          )}
        </div>
      </header>

      {sampleError && (
        <div
          data-testid="studio-preview-error"
          className="flex items-center"
          style={{
            gap: "var(--space-2)",
            padding: "var(--space-3) var(--space-4)",
            background: "var(--color-error-bg)",
            border: "1px solid var(--color-error-border)",
            borderRadius: "var(--radius-xs)",
          }}
        >
          <span className="t-11" style={{ color: "var(--color-error)" }}>
            Sample run échoué : {sampleError}
          </span>
        </div>
      )}

      {totalBlocks === 0 ? (
        <div
          data-testid="studio-preview-empty"
          className="flex flex-col items-center justify-center text-center flex-1"
          style={{
            padding: "var(--space-12)",
            background: "var(--surface-1)",
            border: "1px dashed var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            gap: "var(--space-2)",
          }}
        >
          <span className="t-15" style={{ color: "var(--text-muted)" }}>
            Commence ton rapport
          </span>
          <span className="t-11" style={{ color: "var(--text-faint)" }}>
            Glisse un block depuis la palette à gauche pour démarrer.
          </span>
        </div>
      ) : visibleBlocks.length === 0 ? (
        <div
          className="flex items-center justify-center"
          style={{
            padding: "var(--space-8)",
            border: "1px dashed var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <span className="t-11" style={{ color: "var(--text-faint)" }}>
            Tous les blocks sont masqués.
          </span>
        </div>
      ) : (
        <div
          style={{
            padding: "var(--space-4)",
            background: "var(--surface-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <ReportLayout payload={payloadToRender} showMeta={false} />
        </div>
      )}
    </main>
  );
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Build un RenderPayload statique depuis le spec — pas de fetch. Lit
 * `block.props.preview*` ou `block.props.data` quand fourni inline (cas V2).
 */
function buildLocalPreviewPayload(spec: ReportSpec): RenderPayload {
  const blocks: RenderedBlock[] = spec.blocks
    .filter((b) => !b.hidden)
    .map((block) => ({
      id: block.id,
      type: block.type,
      label: block.label,
      layout: block.layout,
      data: shapePreviewData(block),
      props: block.props ?? {},
    }));

  return {
    __reportPayload: true,
    specId: spec.id,
    version: spec.version,
    generatedAt: Date.now(),
    blocks,
    scalars: {},
  };
}

function shapePreviewData(block: BlockSpec): unknown {
  if (block.type === "kpi") {
    const props = block.props ?? {};
    return {
      value: (props.previewValue as unknown) ?? (props.value as unknown) ?? null,
      delta: (props.previewDelta as unknown) ?? null,
      sparkline: (props.previewSparkline as ReadonlyArray<number>) ?? null,
    };
  }
  return (block.props?.previewRows as ReadonlyArray<Record<string, unknown>>) ?? [];
}
