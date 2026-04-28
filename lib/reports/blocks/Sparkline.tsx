"use client";

/**
 * Sparkline — ligne SVG inline, scaling auto.
 *
 * Style Ghost Protocol :
 *   - stroke `var(--cykan)` 1.5px
 *   - fill : aire sous la courbe à 10% d'opacité
 *   - aucun axis ni grid (mini chart)
 *   - aria-label + <title> pour l'a11y
 *
 * Tous les espacements/couleurs viennent des tokens. La hauteur en CSS via
 * `var(--space-12)` (48px) par défaut, surchargée via prop `height`.
 */

interface SparklineProps {
  values: ReadonlyArray<number>;
  /** Hauteur en pixels. Défaut 48px (= var(--space-12)). */
  height?: number;
  /** Largeur en pixels (le SVG est viewBox responsive). Défaut 240. */
  width?: number;
  /** ARIA label décrivant ce que représente la sparkline. */
  label?: string;
  /** Couleur token. Défaut --cykan. */
  tone?: "cykan" | "warn" | "danger" | "muted";
}

const TONE_COLORS: Record<NonNullable<SparklineProps["tone"]>, string> = {
  cykan: "var(--cykan)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  muted: "var(--text-muted)",
};

export function Sparkline({
  values,
  height = 48,
  width = 240,
  label,
  tone = "cykan",
}: SparklineProps) {
  const cleaned = values.filter((v) => Number.isFinite(v));
  if (cleaned.length < 2) {
    return (
      <div
        role="img"
        aria-label={label ?? "Sparkline indisponible"}
        className="t-9 font-mono uppercase tracking-[0.2em] text-[var(--text-faint)]"
        style={{ height }}
      >
        donnée insuffisante
      </div>
    );
  }

  const min = Math.min(...cleaned);
  const max = Math.max(...cleaned);
  const span = max - min || 1;

  const points = cleaned.map((v, i) => {
    const x = (i / (cleaned.length - 1)) * width;
    const y = height - ((v - min) / span) * height;
    return [x, y] as const;
  });

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)},${p[1].toFixed(2)}`)
    .join(" ");

  const areaPath = `${path} L${width.toFixed(2)},${height} L0,${height} Z`;

  const color = TONE_COLORS[tone];

  return (
    <svg
      role="img"
      aria-label={label ?? `Tendance sur ${cleaned.length} points`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block w-full"
      style={{ height }}
    >
      <title>{label ?? "Tendance"}</title>
      <path d={areaPath} fill={color} fillOpacity={0.1} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
