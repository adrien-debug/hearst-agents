/**
 * Helpers de formatage pour les primitives charts. Aligne sur FR par défaut
 * (séparateur de milliers ` `, décimales `,`).
 */

export function fmtNumber(v: unknown, opts?: { decimals?: number; locale?: string }): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  const decimals = opts?.decimals ?? (Math.abs(n) >= 100 ? 0 : 2);
  return n.toLocaleString(opts?.locale ?? "fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtCurrency(
  v: unknown,
  currency: string = "EUR",
  opts?: { compact?: boolean; locale?: string },
): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  if (opts?.compact && Math.abs(n) >= 1000) {
    return n.toLocaleString(opts?.locale ?? "fr-FR", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    });
  }
  return n.toLocaleString(opts?.locale ?? "fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

export function fmtPercent(v: unknown, opts?: { decimals?: number; locale?: string }): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  const decimals = opts?.decimals ?? 1;
  const formatted = (n * 100).toLocaleString(opts?.locale ?? "fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${formatted} %`;
}

export function fmtDelta(v: unknown): { text: string; tone: "up" | "down" | "neutral" } {
  if (v === null || v === undefined) return { text: "—", tone: "neutral" };
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return { text: "—", tone: "neutral" };
  const sign = n > 0 ? "+" : "";
  const isFractional = Math.abs(n) < 1;
  const text = isFractional
    ? `${sign}${fmtPercent(n)}`
    : `${sign}${fmtNumber(n)}`;
  return { text, tone: n > 0 ? "up" : n < 0 ? "down" : "neutral" };
}
