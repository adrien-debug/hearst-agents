"use client";

/**
 * Graph SVG inline minimaliste — runs + cost par bucket temporel.
 *
 * Pas de lib externe (pas de Recharts), tokens uniquement.
 * Trace 2 lignes : runs (cykan) et cost USD (warn).
 */

interface Point {
  bucket: string;
  runs: number;
  costUsd: number;
}

interface UsageTimeSeriesChartProps {
  points: Point[];
  height?: number;
}

const VIEW_W = 1000;
const PADDING = 32;

export function UsageTimeSeriesChart({
  points,
  height = 220,
}: UsageTimeSeriesChartProps) {
  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center"
        style={{
          height,
          border: "1px solid var(--line-strong)",
          borderRadius: "var(--radius-md)",
          background: "var(--bg-elev)",
        }}
      >
        <span className="t-11 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
          Aucune donnée sur la fenêtre
        </span>
      </div>
    );
  }

  const VIEW_H = height;
  const innerW = VIEW_W - PADDING * 2;
  const innerH = VIEW_H - PADDING * 2;

  const maxRuns = Math.max(1, ...points.map((p) => p.runs));
  const maxCost = Math.max(0.0001, ...points.map((p) => p.costUsd));

  const xStep = points.length > 1 ? innerW / (points.length - 1) : innerW;
  const xAt = (i: number) => PADDING + i * xStep;
  const yRuns = (v: number) => PADDING + innerH - (v / maxRuns) * innerH;
  const yCost = (v: number) => PADDING + innerH - (v / maxCost) * innerH;

  const runsPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yRuns(p.runs)}`)
    .join(" ");
  const costPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yCost(p.costUsd)}`)
    .join(" ");

  const firstLabel = formatBucket(points[0].bucket);
  const lastLabel = formatBucket(points[points.length - 1].bucket);

  return (
    <div
      className="flex flex-col"
      style={{
        gap: "var(--space-2)",
        padding: "var(--space-4)",
        border: "1px solid var(--line-strong)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-elev)",
      }}
    >
      <header className="flex items-baseline justify-between" style={{ gap: "var(--space-3)" }}>
        <h3 className="t-13 font-medium text-[var(--text)]">Usage cross-tenant</h3>
        <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
          <Legend label="runs" colorVar="var(--cykan)" />
          <Legend label="cost USD" colorVar="var(--warn)" />
        </div>
      </header>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        height={VIEW_H}
        preserveAspectRatio="none"
        role="img"
        aria-label="Usage cross-tenant"
      >
        {/* Grille horizontale */}
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1={PADDING}
            y1={PADDING + innerH * p}
            x2={VIEW_W - PADDING}
            y2={PADDING + innerH * p}
            stroke="var(--line-strong)"
            strokeWidth={1}
          />
        ))}
        <path
          d={runsPath}
          fill="none"
          stroke="var(--cykan)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <path
          d={costPath}
          fill="none"
          stroke="var(--warn)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex items-center justify-between" style={{ gap: "var(--space-3)" }}>
        <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
          {firstLabel}
        </span>
        <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
          {lastLabel}
        </span>
      </div>
    </div>
  );
}

function Legend({ label, colorVar }: { label: string; colorVar: string }) {
  return (
    <span
      className="flex items-center t-9 font-mono uppercase tracking-marquee text-[var(--text-muted)]"
      style={{ gap: "var(--space-2)" }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: "var(--space-3)",
          height: "var(--space-1)",
          background: colorVar,
          borderRadius: "var(--radius-pill)",
        }}
      />
      {label}
    </span>
  );
}

function formatBucket(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}
