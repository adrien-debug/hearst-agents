"use client";

/**
 * Funnel — entonnoir de conversion. Trapèzes décroissants.
 *
 * Lit `props.labelField` + `props.valueField`. Calcule conversion vs étape
 * précédente et conversion globale. Affiche label, valeur, conversion %.
 */

import { fmtNumber, fmtPercent } from "./format";
import { inferStringField, inferNumericField } from "./infer";

type Row = Record<string, unknown>;

interface FunnelProps {
  data: ReadonlyArray<Row>;
  labelField?: string;
  valueField?: string;
  /** Limite hard (3-7 idéal). */
  limit?: number;
  tone?: "cykan" | "warn";
}

const TONE_COLORS = {
  cykan: "var(--cykan)",
  warn: "var(--warn)",
} as const;

export function Funnel({
  data,
  labelField,
  valueField,
  limit = 7,
  tone = "cykan",
}: FunnelProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className="t-9 font-mono uppercase tracking-[0.2em] text-[var(--text-faint)]"
        style={{ padding: "var(--space-6)" }}
      >
        Aucune donnée
      </div>
    );
  }

  const lf = labelField ?? inferStringField(data[0]) ?? "label";
  const vf = valueField ?? inferNumericField(data[0]) ?? "value";

  const stages = data.slice(0, limit);
  const top = Number(stages[0]?.[vf] ?? 1) || 1;
  const color = TONE_COLORS[tone];

  return (
    <div
      role="list"
      aria-label="Entonnoir de conversion"
      className="flex flex-col w-full"
      style={{ gap: "var(--space-2)", padding: "var(--space-2) 0" }}
    >
      {stages.map((row, i) => {
        const value = Number(row[vf] ?? 0);
        const widthPct = Math.max(0, Math.min(100, (value / top) * 100));
        const labelStr = String(row[lf] ?? `Étape ${i + 1}`);
        const prevValue = i > 0 ? Number(stages[i - 1][vf] ?? 0) : value;
        const conv = i === 0 ? 1 : (prevValue > 0 ? value / prevValue : 0);
        const globalConv = top > 0 ? value / top : 0;

        return (
          <div
            key={`${labelStr}-${i}`}
            role="listitem"
            className="flex flex-col"
            style={{ gap: "var(--space-1)" }}
          >
            <div className="flex items-center justify-between">
              <span className="t-11 text-[var(--text-soft)]">{labelStr}</span>
              <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
                <span className="t-9 font-mono text-[var(--text-muted)] tabular-nums">
                  {fmtNumber(value)}
                </span>
                <span
                  className="t-9 font-mono uppercase"
                  style={{ color: i === 0 ? "var(--text-faint)" : "var(--cykan)", letterSpacing: "0.15em" }}
                >
                  {i === 0 ? "—" : fmtPercent(conv)}
                </span>
              </div>
            </div>
            <div
              className="relative w-full"
              style={{ height: "var(--space-3)", background: "var(--surface-1)" }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${widthPct}%`,
                  background: color,
                  opacity: 0.85,
                }}
                aria-hidden
                title={`${fmtPercent(globalConv)} du total`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
