"use client";

/**
 * ReportSpecEditor — éditeur preview minimal d'un ReportSpec.
 *
 * V1 minimaliste : aucune réorganisation drag-drop, juste toggles de visibilité
 * par block. Permet à l'utilisateur de prévisualiser un spec et de figer la
 * sélection finale via le callback `onChange`.
 *
 * Layout :
 *   - barre d'outils en haut (compteur, Reset, Apply)
 *   - liste des blocks avec checkbox (kind + title + position layout.col)
 *   - live-preview du ReportLayout en dessous, blocks filtrés
 *
 * Pas d'état serveur, pas de persistance — simple presentation/state-lifting.
 */

import { useMemo, useState } from "react";
import type { ReportSpec, BlockSpec } from "@/lib/reports/spec/schema";
import type { RenderPayload, RenderedBlock } from "@/lib/reports/engine/render-blocks";
import { ReportLayout } from "@/app/(user)/components/ReportLayout";

export interface ReportSpecEditorProps {
  /** Spec source (lecture seule). */
  spec: ReportSpec;
  /**
   * Callback émis quand l'utilisateur clique Apply. Retourne le spec avec
   * uniquement les blocks visibles. La structure (sources/transforms/meta)
   * n'est pas modifiée.
   */
  onChange?: (spec: ReportSpec) => void;
}

export function ReportSpecEditor({ spec, onChange }: ReportSpecEditorProps) {
  // État local : map blockId → visibility. Tout visible par défaut.
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(spec.blocks.map((b) => [b.id, true])),
  );

  const visibleBlocks = useMemo(
    () => spec.blocks.filter((b) => visibility[b.id] !== false),
    [spec.blocks, visibility],
  );

  // Live-preview : on construit un payload depuis le spec, en alimentant
  // chaque RenderedBlock à partir de block.props (cas inline data) ou avec
  // un placeholder vide. Aucun fetch — c'est de la prévisualisation pure.
  const previewPayload = useMemo<RenderPayload>(
    () => buildPreviewPayload(spec, visibleBlocks),
    [spec, visibleBlocks],
  );

  const visibleCount = visibleBlocks.length;
  const totalCount = spec.blocks.length;

  const toggle = (id: string) => {
    setVisibility((prev) => ({ ...prev, [id]: prev[id] === false }));
  };
  const resetAll = () => {
    setVisibility(Object.fromEntries(spec.blocks.map((b) => [b.id, true])));
  };
  const apply = () => {
    if (!onChange) return;
    onChange({ ...spec, blocks: visibleBlocks });
  };

  return (
    <div
      className="flex flex-col w-full"
      style={{ gap: "var(--space-6)" }}
      data-testid="report-spec-editor"
    >
      {/* Barre d'outils */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: "var(--space-4)",
          background: "var(--card-flat-bg)",
          border: "1px solid var(--card-flat-border)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
          <span
            className="t-9 font-mono uppercase text-[var(--text-muted)]"
            style={{ letterSpacing: "var(--tracking-display)" }}
          >
            Visibilité
          </span>
          <span className="t-13 text-[var(--text)] tabular-nums">
            {visibleCount} / {totalCount}
          </span>
        </div>
        <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
          <button
            type="button"
            onClick={resetAll}
            className="t-9 font-mono uppercase text-[var(--text-muted)] hover:text-[var(--text-soft)] transition-colors"
            style={{
              letterSpacing: "var(--tracking-display)",
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--surface-2)",
              borderRadius: "var(--radius-xs)",
              background: "transparent",
            }}
            data-testid="editor-reset"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!onChange}
            className="t-9 font-mono uppercase text-[var(--text-on-cykan)] transition-colors disabled:opacity-50"
            style={{
              letterSpacing: "var(--tracking-display)",
              padding: "var(--space-2) var(--space-3)",
              background: "var(--cykan)",
              border: "1px solid var(--cykan)",
              borderRadius: "var(--radius-xs)",
            }}
            data-testid="editor-apply"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Liste des blocks */}
      <ul
        className="flex flex-col w-full"
        style={{ gap: "var(--space-2)" }}
        data-testid="editor-block-list"
      >
        {spec.blocks.map((block) => {
          const isVisible = visibility[block.id] !== false;
          return (
            <li
              key={block.id}
              className="flex items-center"
              style={{
                gap: "var(--space-3)",
                padding: "var(--space-3) var(--space-4)",
                background: isVisible ? "var(--surface-1)" : "transparent",
                border: "1px solid var(--surface-2)",
                borderRadius: "var(--radius-xs)",
              }}
            >
              <input
                type="checkbox"
                checked={isVisible}
                onChange={() => toggle(block.id)}
                aria-label={`Toggle ${block.id}`}
                data-testid={`editor-toggle-${block.id}`}
                style={{ accentColor: "var(--cykan)" }}
              />
              <span
                className="t-9 font-mono uppercase text-[var(--cykan)]"
                style={{
                  letterSpacing: "var(--tracking-display)",
                  minWidth: "var(--space-20)",
                }}
              >
                {block.type}
              </span>
              <span
                className={`t-11 truncate flex-1 ${
                  isVisible ? "text-[var(--text-soft)]" : "text-[var(--text-faint)]"
                }`}
                title={block.label ?? block.id}
              >
                {block.label ?? block.id}
              </span>
              <span
                className="t-9 font-mono uppercase text-[var(--text-faint)]"
                style={{ letterSpacing: "var(--tracking-display)" }}
              >
                col_{block.layout.col}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Live-preview */}
      <div
        style={{
          padding: "var(--space-6)",
          border: "1px solid var(--card-flat-border)",
          borderRadius: "var(--radius-sm)",
          background: "var(--card-flat-bg)",
        }}
        data-testid="editor-preview"
      >
        {visibleBlocks.length === 0 ? (
          <div
            className="t-9 font-mono uppercase text-[var(--text-faint)]"
            style={{
              letterSpacing: "var(--tracking-display)",
              textAlign: "center",
              padding: "var(--space-8)",
            }}
          >
            Aucun block visible
          </div>
        ) : (
          <ReportLayout payload={previewPayload} showMeta={false} />
        )}
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Construit un RenderPayload de preview depuis un spec et la liste des blocks
 * visibles. Aucun fetch : on lit `block.props` pour les primitives qui portent
 * leur donnée inline (waterfall, gantt, sankey…) et on fournit un placeholder
 * vide pour les autres (le composant affichera "Aucune donnée").
 */
function buildPreviewPayload(
  spec: ReportSpec,
  visibleBlocks: ReadonlyArray<BlockSpec>,
): RenderPayload {
  const blocks: RenderedBlock[] = visibleBlocks.map((block) => ({
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
  // KPI : extrait depuis props.previewValue / props.value si fourni.
  if (block.type === "kpi") {
    const props = block.props ?? {};
    return {
      value: (props.previewValue as unknown) ?? (props.value as unknown) ?? null,
      delta: (props.previewDelta as unknown) ?? null,
      sparkline: (props.previewSparkline as ReadonlyArray<number>) ?? null,
    };
  }
  // Pour les blocks tabulaires, on fournit ce qui est dans props.previewRows
  // sinon une liste vide → fallback "Aucune donnée".
  const rows = (block.props?.previewRows as ReadonlyArray<Record<string, unknown>>) ?? [];
  return rows;
}
