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
 */

import { KpiTile } from "@/lib/reports/blocks/KpiTile";
import { Sparkline } from "@/lib/reports/blocks/Sparkline";
import { Bar } from "@/lib/reports/blocks/Bar";
import { Table } from "@/lib/reports/blocks/Table";
import { Funnel } from "@/lib/reports/blocks/Funnel";
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
}

export function ReportLayout({ payload, showMeta = true }: ReportLayoutProps) {
  return (
    <div className="w-full">
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {payload.blocks.map((block) => (
          <div
            key={block.id}
            style={{ gridColumn: `span ${block.layout.col}` }}
            className="flex flex-col"
          >
            {block.label && block.type !== "kpi" && (
              <div
                className="t-9 font-mono uppercase text-[var(--text-muted)]"
                style={{
                  letterSpacing: "0.2em",
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
          <span className="t-9 font-mono uppercase tracking-[0.3em] text-[var(--text-faint)]">
            spec_v{payload.version}
          </span>
          <span className="t-9 font-mono uppercase tracking-[0.3em] text-[var(--text-faint)]">
            generated_at: {fmtTimestamp(payload.generatedAt)}
          </span>
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
          <span className="t-9 font-mono uppercase tracking-[0.2em] text-[var(--text-faint)]">
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
