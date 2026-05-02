"use client";

/**
 * Barres horizontales — composant dense, aligné Ghost Protocol.
 *
 * Lit les rows et utilise `props.labelField` + `props.valueField` (avec
 * fallback heuristique). Tri descendant par défaut, top N rows visibles.
 */

import { fmtNumber, fmtCurrency } from "./format";
import { inferStringField, inferNumericField } from "./infer";

type Row = Record<string, unknown>;

interface BarProps {
  data: ReadonlyArray<Row>;
  /** Champ pour le label (axe Y). Défaut : 1ère clé string trouvée. */
  labelField?: string;
  /** Champ pour la valeur (largeur de barre). Défaut : 1ère clé number. */
  valueField?: string;
  /** Nb max de barres affichées. Défaut 10. */
  limit?: number;
  /** Format de la valeur. */
  format?: "number" | "currency";
  currency?: string;
  /** Couleur de la barre. */
  tone?: "cykan" | "warn" | "danger" | "muted";
  /** Tri appliqué avant slice. Défaut "desc". */
  direction?: "asc" | "desc" | "none";
}

const TONE_COLORS = {
  cykan: "var(--cykan)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  muted: "var(--text-muted)",
} as const;

export function Bar({
  data,
  labelField,
  valueField,
  limit = 10,
  format = "number",
  currency = "EUR",
  tone = "cykan",
  direction = "desc",
}: BarProps) {
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

  const sorted = direction === "none"
    ? [...data]
    : [...data].sort((a, b) => {
        const av = Number(a[vf] ?? 0);
        const bv = Number(b[vf] ?? 0);
        return direction === "desc" ? bv - av : av - bv;
      });

  const top = sorted.slice(0, limit);
  const max = top.reduce((m, r) => Math.max(m, Number(r[vf] ?? 0)), 0) || 1;
  const color = TONE_COLORS[tone];

  return (
    <div
      role="list"
      aria-label="Barres"
      className="flex flex-col w-full"
      style={{ gap: "var(--space-2)", padding: "var(--space-2) 0" }}
    >
      {top.map((row, i) => {
        const value = Number(row[vf] ?? 0);
        const width = Math.max(0, Math.min(100, (value / max) * 100));
        const labelStr = String(row[lf] ?? "—");
        const valueStr = format === "currency"
          ? fmtCurrency(value, currency, { compact: true })
          : fmtNumber(value);

        return (
          <div
            key={`${labelStr}-${i}`}
            role="listitem"
            className="flex items-center"
            style={{ gap: "var(--space-3)" }}
          >
            <span
              className="t-11 text-[var(--text-soft)] truncate shrink-0"
              style={{ width: "30%", minWidth: "var(--space-20)" }}
              title={labelStr}
            >
              {labelStr}
            </span>
            <div
              className="relative flex-1"
              style={{ height: "var(--space-2)", background: "var(--surface-1)" }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${width}%`,
                  background: color,
                }}
                aria-hidden
              />
            </div>
            <span
              className="t-9 font-mono text-[var(--text-muted)] tabular-nums shrink-0"
              style={{ minWidth: "var(--space-12)", textAlign: "right" }}
            >
              {valueStr}
            </span>
          </div>
        );
      })}
    </div>
  );
}

