"use client";

/**
 * KPI tile — valeur grande + label mono + delta optionnel + sparkline mini.
 *
 * Cohérence Ghost Protocol (HEARST-OS-DESIGN-SYSTEM.html section "data-card") :
 *   data-label : .t-9 font-mono uppercase tracking-[0.3em] text-[var(--text-muted)]
 *   data-value : .t-28 font-light tracking-tight
 *   data-trend : .t-9 font-mono uppercase, cykan/danger/muted selon tone
 *
 * Pas de magic number — tous les espacements via var(--space-*).
 */

import { Sparkline } from "./Sparkline";
import { fmtCurrency, fmtNumber, fmtDelta } from "./format";

export interface KpiTileData {
  value: unknown;
  delta?: unknown;
  sparkline?: ReadonlyArray<number> | null;
}

export interface KpiTileProps {
  data: KpiTileData;
  /** Label affiché en haut, en mono uppercase. */
  label: string;
  /** Format de la valeur. Défaut number. */
  format?: "number" | "currency" | "percent";
  /** Devise si format=currency. Défaut EUR. */
  currency?: string;
  /** Suffixe optionnel collé après la valeur (unité, ex. "j", "h", "%"). */
  suffix?: string;
  /** Mode compact : 1 234 567 → 1,2 M (pour grandes valeurs). */
  compact?: boolean;
}

export function KpiTile({
  data,
  label,
  format = "number",
  currency = "EUR",
  suffix,
  compact = false,
}: KpiTileProps) {
  const value = formatValue(data.value, { format, currency, compact });
  const delta = data.delta !== undefined && data.delta !== null ? fmtDelta(data.delta) : null;

  const deltaColor =
    delta?.tone === "up"
      ? "var(--cykan)"
      : delta?.tone === "down"
        ? "var(--danger)"
        : "var(--text-faint)";

  return (
    <div
      role="group"
      aria-label={`${label}: ${value}${suffix ? " " + suffix : ""}`}
      className="flex flex-col"
      style={{
        gap: "var(--space-2)",
        padding: "var(--space-6)",
        background: "var(--card-flat-bg)",
        border: "1px solid var(--card-flat-border)",
      }}
    >
      <span className="t-9 font-mono uppercase text-[var(--text-muted)]" style={{ letterSpacing: "0.2em" }}>
        {label}
      </span>
      <div className="flex items-baseline" style={{ gap: "var(--space-2)" }}>
        <span className="t-28 text-[var(--text)] tracking-tight" style={{ fontWeight: 200 }}>
          {value}
        </span>
        {suffix && (
          <span className="t-13 text-[var(--text-faint)]">{suffix}</span>
        )}
      </div>
      {delta && (
        <span
          className="t-9 font-mono uppercase"
          style={{ color: deltaColor, letterSpacing: "0.15em" }}
        >
          {delta.text}
        </span>
      )}
      {data.sparkline && data.sparkline.length >= 2 && (
        <div style={{ marginTop: "var(--space-2)" }}>
          <Sparkline
            values={data.sparkline}
            height={32}
            tone={delta?.tone === "down" ? "danger" : "cykan"}
            label={`Tendance ${label}`}
          />
        </div>
      )}
    </div>
  );
}

function formatValue(
  v: unknown,
  opts: { format: "number" | "currency" | "percent"; currency: string; compact: boolean },
): string {
  if (v === null || v === undefined) return "—";
  if (opts.format === "currency") return fmtCurrency(v, opts.currency, { compact: opts.compact });
  if (opts.format === "percent") {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return "—";
    return `${(n * 100).toFixed(1)} %`;
  }
  return fmtNumber(v);
}
