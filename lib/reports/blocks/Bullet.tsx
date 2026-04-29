"use client";

/**
 * Bullet — OKR / target tracking (actual vs target avec ranges qualitatives).
 *
 * Modèle de données :
 *   items: [
 *     {
 *       label: "Revenue Q1",
 *       actual: 78_000,
 *       target: 100_000,
 *       ranges: { bad: 50_000, ok: 80_000, good: 110_000 }
 *     },
 *     …
 *   ]
 *
 * Visuel Ghost Protocol :
 *   - barres horizontales empilées (bands) : bad / ok / good = teintes croissantes
 *     de var(--cykan) (15% → 35% → 55%)
 *   - actual : barre solide var(--cykan) au-dessus
 *   - target : marqueur vertical (trait fin var(--text)) sur l'échelle
 *   - labels en t-11 (libellé) + t-9 mono tabular-nums (valeurs)
 *
 * Pas de magic number. Couleur unique = cykan, l'opacité encode la qualité.
 */

import { fmtNumber } from "./format";

export interface BulletRange {
  bad: number;
  ok: number;
  good: number;
}

export interface BulletItem {
  label: string;
  actual: number;
  target: number;
  ranges: BulletRange;
}

export interface BulletProps {
  items: ReadonlyArray<BulletItem>;
  /** Format des valeurs affichées. */
  format?: "number" | "currency";
  currency?: string;
}

export function Bullet({ items, format = "number" }: BulletProps) {
  if (!items || items.length === 0) {
    return (
      <div
        className="t-9 font-mono uppercase tracking-[0.2em] text-[var(--text-faint)]"
        style={{ padding: "var(--space-6)" }}
        role="img"
        aria-label="Bullet vide"
      >
        Aucune donnée
      </div>
    );
  }

  return (
    <div
      role="list"
      aria-label="Bullets — suivi d'objectifs"
      className="flex flex-col w-full"
      style={{ gap: "var(--space-4)", padding: "var(--space-2) 0" }}
    >
      {items.map((it, i) => {
        const safeActual = Number.isFinite(it.actual) ? it.actual : 0;
        const safeTarget = Number.isFinite(it.target) ? it.target : 0;
        // Normalise les ranges : on les trie pour tolérer un input désordonné.
        const sortedRanges = [it.ranges.bad, it.ranges.ok, it.ranges.good]
          .filter((v) => Number.isFinite(v))
          .sort((a, b) => a - b);
        const [r1 = 0, r2 = 0, r3 = 1] = sortedRanges;

        // Domaine de l'échelle = max(ranges, actual, target).
        const max = Math.max(r3, safeActual, safeTarget) || 1;
        const pctBad = Math.max(0, Math.min(100, (r1 / max) * 100));
        const pctOk = Math.max(0, Math.min(100, (r2 / max) * 100));
        const pctGood = Math.max(0, Math.min(100, (r3 / max) * 100));
        const pctActual = Math.max(0, Math.min(100, (safeActual / max) * 100));
        const pctTarget = Math.max(0, Math.min(100, (safeTarget / max) * 100));

        const valueStr = (v: number) =>
          format === "currency" ? fmtNumber(v) : fmtNumber(v);

        return (
          <div
            key={`${it.label}-${i}`}
            role="listitem"
            className="flex flex-col w-full"
            style={{ gap: "var(--space-2)" }}
          >
            {/* Header : label + actual / target */}
            <div className="flex items-center justify-between">
              <span className="t-11 text-[var(--text-soft)] truncate" title={it.label}>
                {it.label}
              </span>
              <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
                <span className="t-9 font-mono tabular-nums text-[var(--cykan)]">
                  {valueStr(safeActual)}
                </span>
                <span
                  className="t-9 font-mono uppercase text-[var(--text-faint)]"
                  style={{ letterSpacing: "0.15em" }}
                >
                  /
                </span>
                <span className="t-9 font-mono tabular-nums text-[var(--text-muted)]">
                  {valueStr(safeTarget)}
                </span>
              </div>
            </div>

            {/* Barre composite : ranges (background) + actual (foreground) + target (marker) */}
            <div
              className="relative w-full"
              style={{ height: "var(--space-4)", background: "var(--surface-1)" }}
              aria-label={`actual ${valueStr(safeActual)}, target ${valueStr(safeTarget)}`}
            >
              {/* Range bad (0 → r1) */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${pctBad}%`,
                  background: "color-mix(in srgb, var(--cykan) 12%, transparent)",
                }}
                aria-hidden
              />
              {/* Range ok (r1 → r2) */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${pctBad}%`,
                  width: `${Math.max(0, pctOk - pctBad)}%`,
                  background: "color-mix(in srgb, var(--cykan) 28%, transparent)",
                }}
                aria-hidden
              />
              {/* Range good (r2 → r3) */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${pctOk}%`,
                  width: `${Math.max(0, pctGood - pctOk)}%`,
                  background: "color-mix(in srgb, var(--cykan) 45%, transparent)",
                }}
                aria-hidden
              />
              {/* Actual (barre fine au centre) */}
              <div
                style={{
                  position: "absolute",
                  top: "var(--space-1)",
                  bottom: "var(--space-1)",
                  left: 0,
                  width: `${pctActual}%`,
                  background: "var(--cykan)",
                }}
                aria-hidden
                title={`actual : ${valueStr(safeActual)}`}
              />
              {/* Target (marqueur vertical) */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `calc(${pctTarget}% - 1px)`,
                  width: "2px",
                  background: "var(--text)",
                }}
                aria-hidden
                title={`target : ${valueStr(safeTarget)}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
