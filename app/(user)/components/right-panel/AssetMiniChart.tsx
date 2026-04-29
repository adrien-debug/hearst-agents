"use client";

/**
 * AssetMiniChart — micro-chart SVG vectoriel par type d'asset (V05).
 *
 *   - brief         : line chart polyline + area fill
 *   - report/document : 5 barres verticales heights variables
 *   - synthesis     : 8 dots dispersés (scatter)
 *   - plan          : 3 bandes horizontales empilées (stacked)
 *   - fallback      : ligne plate text-faint
 *
 * Les heights/positions "variables" sont déterminées par un hash léger sur
 * le seed (ex: nom du fichier) pour garantir stabilité visuelle entre rerenders.
 */

interface AssetMiniChartProps {
  type: string;
  /** Optional seed (asset name) for deterministic shape variation. */
  seed?: string;
}

const W = 96;
const H = 40;

// Simple deterministic PRNG seeded from a string.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function makeRng(seed: string) {
  let state = hash(seed) || 1;
  return () => {
    // xorshift
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1000) / 1000;
  };
}

export function AssetMiniChart({ type, seed = "" }: AssetMiniChartProps) {
  const t = type.toLowerCase();
  const rng = makeRng(`${t}:${seed}`);

  if (t === "brief") {
    // Line chart : 6 points sur la largeur, en montée/descente douce
    const points = [
      [4, 28],
      [22, 14 + rng() * 8],
      [40, 18 + rng() * 6],
      [58, 8 + rng() * 6],
      [76, 14 + rng() * 6],
      [92, 6 + rng() * 6],
    ];
    const polyD = points.map((p) => p.join(",")).join(" ");
    const areaD = `M${points[0][0]},${H} L${points
      .map((p) => p.join(","))
      .join(" L")} L${points[points.length - 1][0]},${H} Z`;
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="brief preview">
        <title>brief preview</title>
        <path d={areaD} fill="var(--cykan)" opacity="0.15" />
        <polyline points={polyD} fill="none" stroke="var(--cykan)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (t === "report" || t === "document" || t === "doc") {
    // 5 barres verticales aux heights variables
    const bars = Array.from({ length: 5 }, () => 8 + Math.floor(rng() * 26));
    const barW = 12;
    const gap = (W - bars.length * barW) / (bars.length + 1);
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="report preview">
        <title>{t} preview</title>
        {bars.map((h, i) => {
          const x = gap + i * (barW + gap);
          const y = H - h - 2;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barW}
              height={h}
              fill="var(--text-muted)"
              opacity="0.8"
            />
          );
        })}
      </svg>
    );
  }

  if (t === "synthesis") {
    // 8 dots dispersés
    const dots = Array.from({ length: 8 }, () => [
      4 + rng() * (W - 8),
      4 + rng() * (H - 8),
    ]);
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="synthesis preview">
        <title>synthesis preview</title>
        {dots.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={2} fill="var(--warn)" opacity={0.7 + rng() * 0.3} />
        ))}
      </svg>
    );
  }

  if (t === "plan") {
    // 3 bandes horizontales empilées
    const widths = [
      40 + rng() * 40,
      30 + rng() * 50,
      24 + rng() * 60,
    ];
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="plan preview">
        <title>plan preview</title>
        <rect x="2" y="6"  width={widths[0]} height="6" fill="var(--color-success)" opacity="0.85" />
        <rect x="2" y="17" width={widths[1]} height="6" fill="var(--text-muted)" opacity="0.7" />
        <rect x="2" y="28" width={widths[2]} height="6" fill="var(--text-faint)" opacity="0.6" />
      </svg>
    );
  }

  // Fallback
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t} preview`}>
      <title>{t} preview</title>
      <rect x="2" y={H / 2 - 2} width={W - 4} height="4" fill="var(--text-faint)" opacity="0.4" />
    </svg>
  );
}
