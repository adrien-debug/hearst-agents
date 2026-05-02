"use client";

/**
 * Waterfall — décomposition d'un agrégat (P&L, run-rate, variance).
 *
 * Modèle de données :
 *   data: [
 *     { label: "Revenue",  value: 100_000, type: "start"  },
 *     { label: "COGS",     value: -32_000, type: "delta"  },
 *     { label: "Opex",     value: -28_000, type: "delta"  },
 *     { label: "Net",      value:  40_000, type: "total"  },
 *   ]
 *
 * Visuel Ghost Protocol :
 *   - barres verticales avec connecteurs horizontaux entre étapes
 *   - vert/cykan pour deltas positifs
 *   - rouge/danger pour deltas négatifs
 *   - text-default pour les totaux (start/total)
 *   - axe baseline ligne fine var(--surface-2)
 *   - labels mono uppercase t-9, valeurs tabular-nums t-11
 *
 * Pas de magic number — espacements via var(--space-*), couleurs via tokens.
 */

import { fmtCurrency, fmtNumber } from "./format";

export type WaterfallBarType = "start" | "delta" | "total";

export interface WaterfallDatum {
  label: string;
  value: number;
  type: WaterfallBarType;
}

interface WaterfallProps {
  data: ReadonlyArray<WaterfallDatum>;
  /** Hauteur du graphique en pixels. Défaut 240. */
  height?: number;
  /** Format des valeurs affichées. */
  format?: "number" | "currency";
  currency?: string;
}

const BAR_COLORS = {
  positive: "var(--cykan)",
  negative: "var(--danger)",
  total: "var(--text)",
} as const;

export function Waterfall({
  data,
  height = 240,
  format = "currency",
  currency = "EUR",
}: WaterfallProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className="t-9 font-mono uppercase tracking-[0.2em] text-[var(--text-faint)]"
        style={{ padding: "var(--space-6)" }}
        role="img"
        aria-label="Waterfall vide"
      >
        Aucune donnée
      </div>
    );
  }

  // Calcule le cumul à chaque étape pour positionner chaque barre.
  // start/total → barre depuis 0 jusqu'à value.
  // delta → barre depuis cumul précédent jusqu'à cumul précédent + value.
  // On utilise reduce pour ne pas muter de variable libre (lint react-hooks/immutability).
  type Segment = {
    from: number;
    to: number;
    value: number;
    type: WaterfallBarType;
    label: string;
  };
  const { segments } = data.reduce<{ segments: Segment[]; cumul: number }>(
    (acc, d) => {
      const safeValue = Number.isFinite(d.value) ? d.value : 0;
      if (d.type === "start" || d.type === "total") {
        return {
          segments: [
            ...acc.segments,
            { from: 0, to: safeValue, value: safeValue, type: d.type, label: d.label },
          ],
          cumul: safeValue,
        };
      }
      const from = acc.cumul;
      const to = acc.cumul + safeValue;
      return {
        segments: [
          ...acc.segments,
          { from, to, value: safeValue, type: d.type, label: d.label },
        ],
        cumul: to,
      };
    },
    { segments: [], cumul: 0 },
  );

  // Domaine numérique pour l'échelle (inclut min/max sur from et to + 0).
  const allEdges = segments.flatMap((s) => [s.from, s.to]).concat([0]);
  const minDomain = Math.min(...allEdges);
  const maxDomain = Math.max(...allEdges);
  const span = maxDomain - minDomain || 1;

  // Coordonnées du SVG : viewBox responsive, y inversé (haut = max).
  const VB_W = 100 * data.length; // par étape : 100 unités
  const VB_H = 100; // hauteur normalisée
  const BAR_W = 50; // moitié de l'unité étape
  const BAR_PAD = (100 - BAR_W) / 2;

  const yScale = (v: number) => VB_H - ((v - minDomain) / span) * VB_H;
  const baselineY = yScale(0);

  const fmt = (v: number) =>
    format === "currency" ? fmtCurrency(v, currency, { compact: true }) : fmtNumber(v);

  return (
    <div
      role="img"
      aria-label="Waterfall : décomposition par étapes"
      className="flex flex-col w-full"
      style={{ gap: "var(--space-3)" }}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
      >
        <title>Waterfall — {data.length} étapes</title>
        {/* baseline 0 */}
        <line
          x1={0}
          x2={VB_W}
          y1={baselineY}
          y2={baselineY}
          stroke="var(--surface-2)"
          strokeWidth={0.5}
        />
        {segments.map((seg, i) => {
          const xCenter = i * 100 + 50;
          const x = xCenter - BAR_W / 2;
          const yTop = yScale(Math.max(seg.from, seg.to));
          const yBottom = yScale(Math.min(seg.from, seg.to));
          const h = Math.max(0.5, yBottom - yTop);
          const color =
            seg.type === "start" || seg.type === "total"
              ? BAR_COLORS.total
              : seg.value >= 0
                ? BAR_COLORS.positive
                : BAR_COLORS.negative;

          // Connecteur vers l'étape suivante (ligne pointillée horizontale).
          const next = segments[i + 1];
          const connector =
            next && (seg.type === "delta" || seg.type === "start") ? (
              <line
                x1={x + BAR_W}
                x2={i * 100 + 100 + BAR_PAD}
                y1={yScale(seg.to)}
                y2={yScale(seg.to)}
                stroke="var(--surface-2)"
                strokeWidth={0.5}
                strokeDasharray="2 2"
              />
            ) : null;

          return (
            <g key={`${seg.label}-${i}`}>
              <rect
                x={x}
                y={yTop}
                width={BAR_W}
                height={h}
                fill={color}
                fillOpacity={seg.type === "delta" ? 0.85 : 0.65}
              />
              {connector}
            </g>
          );
        })}
      </svg>

      {/* Labels & valeurs sous le graphique, alignés sur la même grille. */}
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`,
          gap: "var(--space-1)",
        }}
      >
        {data.map((d, i) => {
          const color =
            d.type === "start" || d.type === "total"
              ? "var(--text-soft)"
              : d.value >= 0
                ? "var(--cykan)"
                : "var(--danger)";
          const sign = d.type === "delta" ? (d.value >= 0 ? "+" : "") : "";
          return (
            <div
              key={`label-${d.label}-${i}`}
              className="flex flex-col items-center"
              style={{ gap: "var(--space-1)" }}
            >
              <span
                className="t-9 font-mono uppercase text-[var(--text-muted)] truncate w-full"
                style={{ letterSpacing: "0.15em", textAlign: "center" }}
                title={d.label}
              >
                {d.label}
              </span>
              <span
                className="t-11 font-mono tabular-nums"
                style={{ color }}
              >
                {sign}
                {fmt(d.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
