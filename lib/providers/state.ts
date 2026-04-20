/**
 * Provider Usage State — Per-user, per-tenant learning signal.
 *
 * Tracks how each provider performs for a given user+tenant scope.
 * Used by the intelligent resolver to score and rank providers.
 *
 * In-memory for now; persistence can be added via Supabase upsert
 * without changing the interface.
 */

import type { ProviderId } from "./types";

export interface ProviderUsageState {
  providerId: ProviderId;
  userId: string;
  tenantId: string;
  usageCount: number;
  lastUsedAt: number;
  successCount: number;
  failureCount: number;
}

export interface ProviderUsageStats extends ProviderUsageState {
  successRate: number;
}

function stateKey(providerId: ProviderId, userId: string, tenantId: string): string {
  return `${tenantId}:${userId}:${providerId}`;
}

const store = new Map<string, ProviderUsageState>();

function getOrCreate(
  providerId: ProviderId,
  userId: string,
  tenantId: string,
): ProviderUsageState {
  const key = stateKey(providerId, userId, tenantId);
  let state = store.get(key);
  if (!state) {
    state = {
      providerId,
      userId,
      tenantId,
      usageCount: 0,
      lastUsedAt: 0,
      successCount: 0,
      failureCount: 0,
    };
    store.set(key, state);
  }
  return state;
}

// ── Read API ────────────────────────────────────────────────

export function getUsageState(
  providerId: ProviderId,
  userId: string,
  tenantId: string,
): ProviderUsageStats {
  const s = getOrCreate(providerId, userId, tenantId);
  const total = s.successCount + s.failureCount;
  return {
    ...s,
    successRate: total > 0 ? s.successCount / total : 1,
  };
}

export function getAllUsageStates(
  userId: string,
  tenantId: string,
): ProviderUsageStats[] {
  const prefix = `${tenantId}:${userId}:`;
  const results: ProviderUsageStats[] = [];
  for (const [key, s] of store) {
    if (key.startsWith(prefix)) {
      const total = s.successCount + s.failureCount;
      results.push({
        ...s,
        successRate: total > 0 ? s.successCount / total : 1,
      });
    }
  }
  return results;
}

// ── Write API (called after execution) ──────────────────────

export function recordProviderUsed(
  providerId: ProviderId,
  userId: string,
  tenantId: string,
): void {
  const s = getOrCreate(providerId, userId, tenantId);
  s.usageCount += 1;
  s.lastUsedAt = Date.now();
}

export function recordProviderSuccess(
  providerId: ProviderId,
  userId: string,
  tenantId: string,
): void {
  const s = getOrCreate(providerId, userId, tenantId);
  s.successCount += 1;
}

export function recordProviderFailure(
  providerId: ProviderId,
  userId: string,
  tenantId: string,
): void {
  const s = getOrCreate(providerId, userId, tenantId);
  s.failureCount += 1;
}
