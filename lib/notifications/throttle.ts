/**
 * Throttle in-memory pour le dispatcher d'alerting.
 *
 * Règle : pas plus d'une alerte par (tenantId, signalType) par fenêtre de
 * THROTTLE_WINDOW_MS (4h par défaut).
 *
 * Limites connues :
 * - Stocké en mémoire process — un cluster multi-process aura un throttle
 *   par instance. Acceptable V1 vu que l'alerting tourne dans le même worker
 *   que le pipeline reports. Pour passer à du Redis-backed, échanger
 *   `inMemoryStore` avec un store qui implémente la même interface.
 * - Ne survit pas au restart : un signal dans la fenêtre de throttle d'avant
 *   restart sera réémis. Acceptable V1 (mieux que de perdre une alerte).
 */

import type { BusinessSignalType } from "@/lib/reports/signals/types";

/** Fenêtre de dédup : pas plus d'une alerte par (tenant, type) sur cette durée. */
export const THROTTLE_WINDOW_MS = 4 * 60 * 60 * 1000; // 4h

export interface ThrottleStore {
  /** Retourne le timestamp ms de la dernière alerte ; null si jamais émise / expirée. */
  getLast(key: string): number | null;
  /** Marque l'alerte comme émise à `now` ms. */
  markEmitted(key: string, now: number): void;
}

class InMemoryThrottleStore implements ThrottleStore {
  private readonly map = new Map<string, number>();

  getLast(key: string): number | null {
    return this.map.get(key) ?? null;
  }

  markEmitted(key: string, now: number): void {
    this.map.set(key, now);
    // GC paresseux : on purge si la map dépasse 10k entrées.
    if (this.map.size > 10_000) {
      const cutoff = now - THROTTLE_WINDOW_MS * 2;
      for (const [k, t] of this.map) {
        if (t < cutoff) this.map.delete(k);
      }
    }
  }
}

export const inMemoryStore: ThrottleStore = new InMemoryThrottleStore();

function buildThrottleKey(
  tenantId: string,
  signal: BusinessSignalType,
): string {
  return `${tenantId}:${signal}`;
}

/**
 * Pure function : retourne true si l'alerte (tenant, signal) doit être suppressée.
 */
export function shouldThrottle(
  store: ThrottleStore,
  tenantId: string,
  signal: BusinessSignalType,
  now: number,
  windowMs: number = THROTTLE_WINDOW_MS,
): boolean {
  const key = buildThrottleKey(tenantId, signal);
  const last = store.getLast(key);
  if (last === null) return false;
  return now - last < windowMs;
}
