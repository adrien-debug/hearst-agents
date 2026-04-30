/**
 * lib/monitoring/web-vitals-store.ts
 *
 * Store in-memory pour les Core Web Vitals collectés côté client.
 *
 * - Rolling window 100 mesures max par métrique
 * - Calcul p75 (standard Google CrUX)
 * - Mapping rating automatique selon les seuils officiels Google 2024
 * - Process-local, reset au redémarrage (pas de persistence DB en V1)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VitalName = "LCP" | "CLS" | "INP" | "TTFB" | "FCP";
export type VitalRating = "good" | "needs-improvement" | "poor";

export interface VitalRecord {
  name: VitalName;
  value: number;
  rating: VitalRating;
  delta: number;
  id: string;
  navigationType?: string;
  recordedAt: number;
}

export interface VitalMetricSnapshot {
  p75: number;
  rating: VitalRating;
  count: number;
}

export type VitalsSnapshot = Record<VitalName, VitalMetricSnapshot>;

// ---------------------------------------------------------------------------
// Seuils Google (https://web.dev/vitals/ — 2024)
// ---------------------------------------------------------------------------

export const VITAL_THRESHOLDS: Record<VitalName, { good: number; poor: number }> = {
  /** LCP : good ≤ 2 500 ms, poor > 4 000 ms */
  LCP: { good: 2500, poor: 4000 },
  /** CLS : good ≤ 0.1, poor > 0.25 */
  CLS: { good: 0.1, poor: 0.25 },
  /** INP : good ≤ 200 ms, poor > 500 ms */
  INP: { good: 200, poor: 500 },
  /** TTFB : good ≤ 800 ms, poor > 1 800 ms */
  TTFB: { good: 800, poor: 1800 },
  /** FCP : good ≤ 1 800 ms, poor > 3 000 ms */
  FCP: { good: 1800, poor: 3000 },
};

/** Taille max de la rolling window par métrique. */
export const VITALS_WINDOW_SIZE = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ratingFromValue(name: VitalName, value: number): VitalRating {
  const t = VITAL_THRESHOLDS[name];
  if (value <= t.good) return "good";
  if (value <= t.poor) return "needs-improvement";
  return "poor";
}

/**
 * Percentile 75 sur un tableau non trié (crée une copie).
 * Retourne 0 si le tableau est vide.
 */
export function p75(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = 0.75 * (sorted.length - 1);
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[Math.min(base + 1, sorted.length - 1)];
  return sorted[base] + rest * (next - sorted[base]);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class WebVitalsStore {
  private windows = new Map<VitalName, number[]>();

  /** Enregistre une mesure vitale. Éviction FIFO si rolling window pleine. */
  recordVital(record: Omit<VitalRecord, "recordedAt">): void {
    const name = record.name;
    if (!this.windows.has(name)) {
      this.windows.set(name, []);
    }
    const window = this.windows.get(name)!;
    window.push(record.value);
    if (window.length > VITALS_WINDOW_SIZE) {
      window.shift();
    }
  }

  /** Retourne le snapshot p75 pour chaque métrique. */
  getSnapshot(): VitalsSnapshot {
    const metrics: VitalName[] = ["LCP", "CLS", "INP", "TTFB", "FCP"];
    const result = {} as VitalsSnapshot;

    for (const name of metrics) {
      const values = this.windows.get(name) ?? [];
      const value = p75(values);
      result[name] = {
        p75: value,
        rating: values.length === 0 ? "good" : ratingFromValue(name, value),
        count: values.length,
      };
    }

    return result;
  }

  /** Vide toutes les données. Utile en tests. */
  reset(): void {
    this.windows.clear();
  }
}

// ---------------------------------------------------------------------------
// Singleton par défaut
// ---------------------------------------------------------------------------

export const defaultVitalsStore = new WebVitalsStore();

export function recordVital(record: Omit<VitalRecord, "recordedAt">): void {
  defaultVitalsStore.recordVital(record);
}

export function getVitalsSnapshot(): VitalsSnapshot {
  return defaultVitalsStore.getSnapshot();
}
