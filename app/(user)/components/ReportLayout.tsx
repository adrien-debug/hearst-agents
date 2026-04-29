"use client";

/**
 * ReportLayout — rend un payload report (sortie de runReport) en grille 4 cols.
 *
 * Branchement Focal : FocalStage détecte `previewContent` parsable JSON avec
 * `__reportPayload: true` et délègue à ce composant.
 *
 * Layout : grid 4 colonnes (1 = quart, 2 = moitié, 4 = pleine), gap via tokens.
 * Cohérence Ghost Protocol : sections labelisées en mono uppercase, lignes 1px
 * sur surface-2, accent cyan pour les hover et titres section.
 *
 * Édition : si `spec` + `onSpecChange` sont fournis, un bouton "Éditer" en
 * header ouvre un panneau latéral droit (`ReportEditor`) qui permet de toggler
 * la visibilité, réordonner et reset les blocks. Les blocks marqués `hidden:true`
 * sont filtrés du rendu côté UI sans toucher aux données amont.
 */

import { useMemo, useState } from "react";
import type { ReportSpec } from "@/lib/reports/spec/schema";
import { ReportEditor } from "@/app/(user)/components/reports/ReportEditor";
import { ReportActions } from "@/app/(user)/components/ReportActions";
import { KpiTile } from "@/lib/reports/blocks/KpiTile";
import { Sparkline } from "@/lib/reports/blocks/Sparkline";
import { Bar } from "@/lib/reports/blocks/Bar";
import { Table } from "@/lib/reports/blocks/Table";
import { Funnel } from "@/lib/reports/blocks/Funnel";
import {
  Waterfall,
  type WaterfallDatum,
} from "@/lib/reports/blocks/Waterfall";
import {
  CohortTriangle,
  type CohortRow,
} from "@/lib/reports/blocks/CohortTriangle";
import { Heatmap } from "@/lib/reports/blocks/Heatmap";
import {
  Sankey,
  type SankeyNode,
  type SankeyLink,
} from "@/lib/reports/blocks/Sankey";
import {
  Bullet,
  type BulletItem,
} from "@/lib/reports/blocks/Bullet";
import {
  Radar,
  type RadarSeries,
} from "@/lib/reports/blocks/Radar";
import {
  Gantt,
  type GanttRange,
  type GanttTask,
} from "@/lib/reports/blocks/Gantt";
import { inferNumericField } from "@/lib/reports/blocks/infer";
import type { RenderPayload, RenderedBlock } from "@/lib/reports/engine/render-blocks";

export function isReportPayload(value: unknown): value is RenderPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "__reportPayload" in value &&
    (value as { __reportPayload: unknown }).__reportPayload === true
  );
}

interface ReportLayoutProps {
  payload: RenderPayload;
  /** Affichage optionnel d'un footer technique (timestamp, version). */
  showMeta?: boolean;
  /**
   * Spec source courant (optionnel). Si fourni avec `onSpecChange`, le bouton
   * "Éditer" du header ouvre le panneau ReportEditor et les blocks `hidden`
   * sont filtrés du rendu.
   */
  spec?: ReportSpec;
  /** Callback pour synchroniser le spec avec un parent contrôlé. */
  onSpecChange?: (spec: ReportSpec) => void;
  /**
   * Asset.id du report rendu (optionnel). Si fourni, affiche les boutons
   * "Exporter / Partager / Commenter" en header. Sinon, header vide.
   */
  assetId?: string | null;
  /** Titre suggéré pour l'export (sinon "report"). */
  assetTitle?: string;
  /**
   * Si `true`, masque les actions et passe en mode lecture seule (page publique).
   * Par défaut `false` (les actions sont visibles si assetId fourni).
   */
  readonly?: boolean;
}

export function ReportLayout({
  payload,
  showMeta = true,
  spec,
  onSpecChange,
  assetId,
  assetTitle,
  readonly = false,
}: ReportLayoutProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const editable = Boolean(spec && onSpecChange);

  // Set des ids hidden tirée du spec courant (si fourni). Les blocks sans entry
  // dans le spec restent visibles par défaut.
  const hiddenIds = useMemo(() => {
    if (!spec) return new Set<string>();
    return new Set(spec.blocks.filter((b) => b.hidden).map((b) => b.id));
  }, [spec]);

  // Ordre potentiellement remanié par l'éditeur : si spec fourni, on suit
  // l'ordre du spec en filtrant les hidden ; sinon on prend tel quel le payload.
  const orderedBlocks = useMemo(() => {
    if (!spec) return payload.blocks;
    const byId = new Map(payload.blocks.map((b) => [b.id, b]));
    const ordered = spec.blocks
      .filter((b) => !b.hidden)
      .map((b) => byId.get(b.id))
      .filter((b): b is RenderedBlock => Boolean(b));
    return ordered;
  }, [spec, payload.blocks]);

  const visibleBlocks = spec
    ? orderedBlocks
    : payload.blocks.filter((b) => !hiddenIds.has(b.id));

  return (
    <div
      className="flex w-full"
      style={{ gap: "var(--space-4)" }}
      data-testid="report-layout"
    >
      <div className="flex flex-col flex-1 min-w-0">
        {(editable || (assetId && !readonly)) && (
          <div
            className="flex items-center justify-end"
            style={{ marginBottom: "var(--space-3)", gap: "var(--space-2)" }}
          >
            {assetId && !readonly && (
              <ReportActions reportId={assetId} title={assetTitle} />
            )}
            {editable && (
              <button
                type="button"
                onClick={() => setEditorOpen((v) => !v)}
                data-testid="report-layout-edit-toggle"
                aria-expanded={editorOpen}
                className="t-9 font-mono uppercase text-[var(--text-muted)] hover:text-[var(--cykan)]"
                style={{
                  letterSpacing: "var(--tracking-display)",
                  padding: "var(--space-2) var(--space-3)",
                  border: "1px solid var(--surface-2)",
                  borderRadius: "var(--radius-xs)",
                  background: "transparent",
                  transition: "color var(--duration-fast) var(--ease-standard)",
                }}
              >
                {editorOpen ? "Fermer" : "Éditer"}
              </button>
            )}
          </div>
        )}

        <div
          className="grid w-full"
          style={{
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "var(--space-4)",
          }}
        >
          {visibleBlocks.map((block) => (
            <div
              key={block.id}
              style={{ gridColumn: `span ${block.layout.col}` }}
              className="flex flex-col"
            >
              {block.label && block.type !== "kpi" && (
                <div
                  className="t-9 font-mono uppercase text-[var(--text-muted)]"
                  style={{
                    letterSpacing: "var(--tracking-display)",
                    marginBottom: "var(--space-3)",
                    paddingBottom: "var(--space-2)",
                    borderBottom: "1px solid var(--surface-2)",
                  }}
                >
                  {block.label}
                </div>
              )}
              <BlockRenderer block={block} />
            </div>
          ))}
        </div>

        {showMeta && (
          <div
            className="flex items-center"
            style={{
              gap: "var(--space-6)",
              marginTop: "var(--space-8)",
              paddingTop: "var(--space-4)",
              borderTop: "1px solid var(--surface-2)",
            }}
          >
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
              spec_v{payload.version}
            </span>
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
              generated_at: {fmtTimestamp(payload.generatedAt)}
            </span>
          </div>
        )}
      </div>

      {editable && editorOpen && spec && onSpecChange && (
        <div
          className="flex flex-col shrink-0"
          style={{ width: "var(--width-context)" }}
        >
          <ReportEditor
            spec={spec}
            onChange={onSpecChange}
            onClose={() => setEditorOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function BlockRenderer({ block }: { block: RenderedBlock }) {
  const props = block.props ?? {};

  switch (block.type) {
    case "kpi":
      return (
        <KpiTile
          data={block.data as { value: unknown; delta?: unknown; sparkline?: ReadonlyArray<number> | null }}
          label={block.label ?? block.id}
          format={(props.format as "number" | "currency" | "percent") ?? "number"}
          currency={(props.currency as string) ?? "EUR"}
          suffix={props.suffix as string | undefined}
          compact={Boolean(props.compact)}
        />
      );

    case "sparkline": {
      const rows = block.data as ReadonlyArray<Record<string, unknown>>;
      const field = (props.field as string) ?? inferNumericField(rows[0]);
      const values = field
        ? rows.map((r) => Number(r[field])).filter((v) => Number.isFinite(v))
        : [];
      return (
        <Sparkline
          values={values}
          height={(props.height as number) ?? 64}
          tone={(props.tone as "cykan" | "warn" | "danger" | "muted") ?? "cykan"}
          label={block.label}
        />
      );
    }

    case "bar":
      return (
        <Bar
          data={block.data as ReadonlyArray<Record<string, unknown>>}
          labelField={props.labelField as string | undefined}
          valueField={props.valueField as string | undefined}
          limit={(props.limit as number) ?? 10}
          format={(props.format as "number" | "currency") ?? "number"}
          currency={(props.currency as string) ?? "EUR"}
          tone={(props.tone as "cykan" | "warn" | "danger" | "muted") ?? "cykan"}
          direction={(props.direction as "asc" | "desc" | "none") ?? "desc"}
        />
      );

    case "table":
      return (
        <Table
          data={block.data as ReadonlyArray<Record<string, unknown>>}
          columns={props.columns as ReadonlyArray<string> | undefined}
          labels={props.labels as Record<string, string> | undefined}
          formats={props.formats as Record<string, "number" | "currency" | "date" | "text"> | undefined}
          currency={(props.currency as string) ?? "EUR"}
          limit={(props.limit as number) ?? 50}
        />
      );

    case "funnel":
      return (
        <Funnel
          data={block.data as ReadonlyArray<Record<string, unknown>>}
          labelField={props.labelField as string | undefined}
          valueField={props.valueField as string | undefined}
          limit={(props.limit as number) ?? 7}
          tone={(props.tone as "cykan" | "warn") ?? "cykan"}
        />
      );

    case "waterfall":
      return (
        <Waterfall
          data={(props.data as ReadonlyArray<WaterfallDatum>) ?? []}
          height={(props.height as number) ?? 240}
          format={(props.format as "number" | "currency") ?? "currency"}
          currency={(props.currency as string) ?? "EUR"}
        />
      );

    case "cohort_triangle":
      return (
        <CohortTriangle
          cohorts={(props.cohorts as ReadonlyArray<CohortRow>) ?? []}
          periodPrefix={(props.periodPrefix as string) ?? "M"}
          asPercent={props.asPercent !== false}
        />
      );

    case "heatmap":
      return (
        <Heatmap
          xLabels={(props.xLabels as ReadonlyArray<string>) ?? []}
          yLabels={(props.yLabels as ReadonlyArray<string>) ?? []}
          values={(props.values as ReadonlyArray<ReadonlyArray<number>>) ?? []}
          cellHeight={props.cellHeight as number | undefined}
          showValues={Boolean(props.showValues)}
        />
      );

    case "sankey":
      return (
        <Sankey
          nodes={(props.nodes as ReadonlyArray<SankeyNode>) ?? []}
          links={(props.links as ReadonlyArray<SankeyLink>) ?? []}
          height={(props.height as number) ?? 280}
        />
      );

    case "bullet":
      return (
        <Bullet
          items={(props.items as ReadonlyArray<BulletItem>) ?? []}
          format={(props.format as "number" | "currency") ?? "number"}
          currency={(props.currency as string) ?? "EUR"}
        />
      );

    case "radar":
      return (
        <Radar
          axes={(props.axes as ReadonlyArray<string>) ?? []}
          series={(props.series as ReadonlyArray<RadarSeries>) ?? []}
          height={(props.height as number) ?? 320}
          rings={props.rings as number | undefined}
        />
      );

    case "gantt":
      return (
        <Gantt
          range={(props.range as GanttRange) ?? { start: "", end: "" }}
          tasks={(props.tasks as ReadonlyArray<GanttTask>) ?? []}
          height={props.height as number | undefined}
        />
      );

    default:
      // Primitives V2/V3 pas encore implémentées — placeholder respectant la grille.
      return (
        <div
          className="flex items-center justify-center"
          style={{
            padding: "var(--space-6)",
            background: "var(--card-flat-bg)",
            border: "1px dashed var(--card-flat-border)",
            minHeight: "var(--space-12)",
          }}
        >
          <span className="t-9 font-mono uppercase tracking-display text-[var(--text-faint)]">
            {block.type}_pending
          </span>
        </div>
      );
  }
}

function fmtTimestamp(ms: number): string {
  try {
    return new Date(ms).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}
