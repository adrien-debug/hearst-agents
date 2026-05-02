/**
 * lazy.tsx — dynamic imports pour les blocs visuels lourds (SVG complexes).
 *
 * Ces blocs ne sont chargés que quand ils apparaissent dans le rapport courant.
 * Les blocs légers (KpiTile, Sparkline, Bar, Table, Funnel, Bullet) restent
 * en import statique dans ReportLayout.tsx pour un rendu immédiat.
 *
 * Pattern : ssr:false car ces blocs sont client-only (SVG interactif, calcul layout).
 */

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { WaterfallDatum } from "@/lib/reports/blocks/Waterfall";
import type { CohortRow } from "@/lib/reports/blocks/CohortTriangle";
import type { SankeyNode, SankeyLink } from "@/lib/reports/blocks/Sankey";
import type { RadarSeries } from "@/lib/reports/blocks/Radar";
import type { GanttRange, GanttTask } from "@/lib/reports/blocks/Gantt";

// ── Types des props des blocs lourds ────────────────────────────────────────

interface WaterfallLazyProps {
  data: ReadonlyArray<WaterfallDatum>;
  height?: number;
  format?: "number" | "currency";
  currency?: string;
}

interface CohortTriangleLazyProps {
  cohorts: ReadonlyArray<CohortRow>;
  periodPrefix?: string;
  asPercent?: boolean;
}

interface HeatmapLazyProps {
  xLabels: ReadonlyArray<string>;
  yLabels: ReadonlyArray<string>;
  values: ReadonlyArray<ReadonlyArray<number>>;
  cellHeight?: number;
  showValues?: boolean;
}

interface SankeyLazyProps {
  nodes: ReadonlyArray<SankeyNode>;
  links: ReadonlyArray<SankeyLink>;
  height?: number;
}

interface RadarLazyProps {
  axes: ReadonlyArray<string>;
  series: ReadonlyArray<RadarSeries>;
  height?: number;
  rings?: number;
}

interface GanttLazyProps {
  range: GanttRange;
  tasks: ReadonlyArray<GanttTask>;
  height?: number;
}

// ── BlockSkeleton : placeholder animate-pulse ──────────────────────────────

const BLOCK_SKELETON_TESTID = "block-skeleton";

export function BlockSkeleton({ testId }: { testId?: string } = {}) {
  return (
    <div
      data-testid={testId ?? BLOCK_SKELETON_TESTID}
      className="animate-pulse flex items-center justify-center"
      style={{
        minHeight: "var(--space-16)",
        background: "var(--surface-2)",
        borderRadius: "var(--radius-xs)",
      }}
      aria-busy="true"
      aria-label="Chargement du bloc..."
    >
      <span
        className="t-9 font-mono"
        style={{ color: "var(--text-faint)", letterSpacing: "var(--tracking-display)" }}
      >
        Chargement...
      </span>
    </div>
  );
}

// ── Dynamic imports ──────────────────────────────────────────────────────────

export const LazyWaterfall = dynamic(
  () => import("@/lib/reports/blocks/Waterfall").then((m) => m.Waterfall),
  { loading: () => <BlockSkeleton />, ssr: false },
) as ComponentType<WaterfallLazyProps>;

export const LazyCohortTriangle = dynamic(
  () => import("@/lib/reports/blocks/CohortTriangle").then((m) => m.CohortTriangle),
  { loading: () => <BlockSkeleton />, ssr: false },
) as ComponentType<CohortTriangleLazyProps>;

export const LazyHeatmap = dynamic(
  () => import("@/lib/reports/blocks/Heatmap").then((m) => m.Heatmap),
  { loading: () => <BlockSkeleton />, ssr: false },
) as ComponentType<HeatmapLazyProps>;

export const LazySankey = dynamic(
  () => import("@/lib/reports/blocks/Sankey").then((m) => m.Sankey),
  { loading: () => <BlockSkeleton />, ssr: false },
) as ComponentType<SankeyLazyProps>;

export const LazyRadar = dynamic(
  () => import("@/lib/reports/blocks/Radar").then((m) => m.Radar),
  { loading: () => <BlockSkeleton />, ssr: false },
) as ComponentType<RadarLazyProps>;

export const LazyGantt = dynamic(
  () => import("@/lib/reports/blocks/Gantt").then((m) => m.Gantt),
  { loading: () => <BlockSkeleton />, ssr: false },
) as ComponentType<GanttLazyProps>;
