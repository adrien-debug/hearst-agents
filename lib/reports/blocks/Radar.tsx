"use client";

/**
 * Radar — compétences/performance multi-axes.
 *
 * Modèle de données :
 *   axes:   ["Vélocité", "Qualité", "DX", "Sécurité", "Coût"]
 *   series: [
 *     { label: "Q1", values: [0.8, 0.7, 0.6, 0.5, 0.9] },
 *     { label: "Q2", values: [0.85, 0.72, 0.7, 0.6, 0.88] },
 *   ]
 *
 * Visuel Ghost Protocol :
 *   - cercles concentriques (échelle 0 → max) en var(--surface-2)
 *   - axes radiaux fins en var(--surface-2)
 *   - polygone par série en var(--cykan), fill avec color-mix opacité 40%
 *   - labels axes en t-9 mono uppercase var(--text-muted)
 *
 * Pas de magic number. Couleur unique = cykan, l'opacité encode l'empilement
 * éventuel des séries.
 */

import { fmtNumber } from "./format";

export interface RadarSeries {
  label: string;
  values: ReadonlyArray<number>;
}

interface RadarProps {
  axes: ReadonlyArray<string>;
  series: ReadonlyArray<RadarSeries>;
  /** Hauteur du graphique en pixels. Défaut 320. */
  height?: number;
  /** Nombre de cercles de référence concentriques. Défaut 4. */
  rings?: number;
}

const VB_SIZE = 400;
const CENTER = VB_SIZE / 2;
const RADIUS = VB_SIZE * 0.4;
const LABEL_RADIUS = VB_SIZE * 0.46;

export function Radar({ axes, series, height = 320, rings = 4 }: RadarProps) {
  if (!axes || axes.length === 0 || !series || series.length === 0) {
    return (
      <div
        className="t-9 font-mono uppercase tracking-[0.2em] text-[var(--text-faint)]"
        style={{ padding: "var(--space-6)" }}
        role="img"
        aria-label="Radar vide"
      >
        Aucune donnée
      </div>
    );
  }

  // Domaine : max sur toutes les valeurs des séries.
  const allValues = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  const vMax = allValues.length > 0 ? Math.max(...allValues) : 1;
  const safeMax = vMax > 0 ? vMax : 1;

  // Angle par axe (commence en haut, sens horaire).
  const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
  const pointFor = (i: number, ratio: number) => {
    const a = angleFor(i);
    const r = RADIUS * Math.max(0, Math.min(1, ratio));
    return {
      x: CENTER + Math.cos(a) * r,
      y: CENTER + Math.sin(a) * r,
    };
  };

  const ringRadii = Array.from({ length: rings }, (_, i) => ((i + 1) / rings) * RADIUS);

  return (
    <div
      role="img"
      aria-label={`Radar ${axes.length} axes ${series.length} séries`}
      className="flex flex-col w-full"
      style={{ gap: "var(--space-3)" }}
    >
      <svg
        viewBox={`0 0 ${VB_SIZE} ${VB_SIZE}`}
        preserveAspectRatio="xMidYMid meet"
        className="block w-full"
        style={{ height }}
      >
        <title>Radar — {series.length} séries × {axes.length} axes</title>

        {/* Cercles concentriques (échelle de fond) */}
        {ringRadii.map((r, i) => (
          <circle
            key={`ring-${i}`}
            cx={CENTER}
            cy={CENTER}
            r={r}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth={0.6}
          />
        ))}

        {/* Axes radiaux */}
        {axes.map((_, i) => {
          const p = pointFor(i, 1);
          return (
            <line
              key={`axis-${i}`}
              x1={CENTER}
              y1={CENTER}
              x2={p.x}
              y2={p.y}
              stroke="var(--surface-2)"
              strokeWidth={0.6}
            />
          );
        })}

        {/* Polygone par série */}
        {series.map((s, si) => {
          const points = axes.map((_, ai) => {
            const v = s.values[ai];
            const ratio = Number.isFinite(v) ? v / safeMax : 0;
            return pointFor(ai, ratio);
          });
          const path = points
            .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
            .join(" ") + " Z";
          // Plusieurs séries → on dégrade l'opacité du fill pour distinguer.
          const fillOpacity = series.length === 1 ? 40 : Math.max(20, 50 - si * 12);
          return (
            <g key={`series-${s.label}-${si}`}>
              <path
                d={path}
                fill={`color-mix(in srgb, var(--cykan) ${fillOpacity}%, transparent)`}
                stroke="var(--cykan)"
                strokeWidth={1.2}
                strokeLinejoin="round"
              >
                <title>{s.label}</title>
              </path>
              {/* Points marqueurs aux sommets pour lisibilité */}
              {points.map((p, pi) => (
                <circle
                  key={`pt-${si}-${pi}`}
                  cx={p.x}
                  cy={p.y}
                  r={2.5}
                  fill="var(--cykan)"
                />
              ))}
            </g>
          );
        })}

        {/* Labels axes */}
        {axes.map((label, i) => {
          const a = angleFor(i);
          const x = CENTER + Math.cos(a) * LABEL_RADIUS;
          const y = CENTER + Math.sin(a) * LABEL_RADIUS;
          // Anchor selon la position pour éviter de couper le label.
          const cosA = Math.cos(a);
          const anchor = Math.abs(cosA) < 0.2 ? "middle" : cosA > 0 ? "start" : "end";
          return (
            <text
              key={`label-${label}-${i}`}
              x={x}
              y={y}
              textAnchor={anchor}
              dominantBaseline="middle"
              fill="var(--text-muted)"
              className="t-9 font-mono uppercase"
              style={{ letterSpacing: "0.15em" }}
            >
              {label}
            </text>
          );
        })}
      </svg>

      {/* Légende des séries */}
      {series.length > 1 && (
        <div
          className="flex flex-wrap"
          style={{ gap: "var(--space-3)" }}
        >
          {series.map((s, si) => (
            <div
              key={`legend-${s.label}-${si}`}
              className="flex items-center"
              style={{ gap: "var(--space-2)" }}
            >
              <span
                aria-hidden
                style={{
                  width: "var(--space-3)",
                  height: "var(--space-2)",
                  background: `color-mix(in srgb, var(--cykan) ${Math.max(20, 50 - si * 12)}%, transparent)`,
                  border: "1px solid var(--cykan)",
                }}
              />
              <span
                className="t-9 font-mono uppercase text-[var(--text-muted)]"
                style={{ letterSpacing: "0.15em" }}
              >
                {s.label}
              </span>
              <span className="t-9 font-mono tabular-nums text-[var(--text-faint)]">
                max {fmtNumber(Math.max(...s.values.filter((v) => Number.isFinite(v)), 0))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
