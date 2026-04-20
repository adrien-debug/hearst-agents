/**
 * Intelligent Provider Resolver.
 *
 * Given a capability + user context, selects the best provider
 * using a scoring algorithm that combines:
 *   - static registry priority
 *   - runtime success rate
 *   - usage recency
 *   - usage frequency
 *
 * Supports:
 *   - forced provider (user correction / explicit request)
 *   - fallback chain (if first pick fails)
 *   - multi-tenant isolation
 */

import type { ConnectorCapability } from "@/lib/connectors/platform/types";
import type { ProviderId, ProviderDefinition } from "./types";
import { isProviderId } from "./types";
import { getProvidersByCapability, getProviderById } from "./registry";
import { getUsageState, recordProviderUsed } from "./state";

// ── Scoring weights ─────────────────────────────────────────

const WEIGHT_PRIORITY = 1.0;
const WEIGHT_USAGE = 0.5;
const WEIGHT_RECENCY = 0.3;
const WEIGHT_SUCCESS = 2.0;

const RECENCY_HALF_LIFE_MS = 24 * 60 * 60 * 1000; // 24h

// ── Types ───────────────────────────────────────────────────

export interface ResolverContext {
  capability: ConnectorCapability;
  userId: string;
  tenantId: string;
  /** If set, bypass scoring and use this provider directly. */
  forcedProviderId?: ProviderId;
  /** Provider IDs known to be connected for this user. */
  connectedProviders: ProviderId[];
}

export interface ResolverResult {
  provider: ProviderDefinition;
  score: number;
  reason: "forced" | "scored" | "fallback" | "only_option";
}

export interface ResolverResultWithFallbacks extends ResolverResult {
  fallbacks: ProviderDefinition[];
}

// ── Core resolver ───────────────────────────────────────────

function computeRecencyBoost(lastUsedAt: number): number {
  if (lastUsedAt === 0) return 0;
  const age = Date.now() - lastUsedAt;
  return Math.max(0, 1 - age / RECENCY_HALF_LIFE_MS);
}

function scoreProvider(
  provider: ProviderDefinition,
  userId: string,
  tenantId: string,
): number {
  const usage = getUsageState(provider.id, userId, tenantId);

  const priorityScore = provider.priority * WEIGHT_PRIORITY;
  const usageScore = Math.min(usage.usageCount, 100) / 100 * WEIGHT_USAGE;
  const recencyScore = computeRecencyBoost(usage.lastUsedAt) * WEIGHT_RECENCY;
  const successScore = usage.successRate * WEIGHT_SUCCESS;

  return priorityScore + usageScore + recencyScore + successScore;
}

/**
 * Resolve the best provider for a capability.
 *
 * Returns the selected provider + ranked fallback chain.
 * Returns null if no provider supports this capability.
 */
export function resolveProvider(ctx: ResolverContext): ResolverResultWithFallbacks | null {
  // ── Forced provider (user said "use Slack") ─────────────
  if (ctx.forcedProviderId) {
    const forced = getProviderById(ctx.forcedProviderId);
    if (forced) {
      recordProviderUsed(forced.id, ctx.userId, ctx.tenantId);

      const remaining = getProvidersByCapability(ctx.capability)
        .filter((p) => p.id !== forced.id && ctx.connectedProviders.includes(p.id));

      return {
        provider: forced,
        score: Infinity,
        reason: "forced",
        fallbacks: remaining,
      };
    }
  }

  // ── Capability-based resolution ─────────────────────────
  const candidates = getProvidersByCapability(ctx.capability)
    .filter((p) => ctx.connectedProviders.includes(p.id));

  if (candidates.length === 0) return null;

  if (candidates.length === 1) {
    recordProviderUsed(candidates[0].id, ctx.userId, ctx.tenantId);
    return {
      provider: candidates[0],
      score: scoreProvider(candidates[0], ctx.userId, ctx.tenantId),
      reason: "only_option",
      fallbacks: [],
    };
  }

  // ── Score and rank ──────────────────────────────────────
  const scored = candidates
    .map((p) => ({ provider: p, score: scoreProvider(p, ctx.userId, ctx.tenantId) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  recordProviderUsed(best.provider.id, ctx.userId, ctx.tenantId);

  return {
    provider: best.provider,
    score: best.score,
    reason: "scored",
    fallbacks: scored.slice(1).map((s) => s.provider),
  };
}

/**
 * Attempt the next fallback provider after a failure.
 * Returns null if no fallbacks remain.
 */
export function resolveFallback(
  ctx: ResolverContext,
  failedProviderIds: ProviderId[],
): ResolverResult | null {
  const candidates = getProvidersByCapability(ctx.capability)
    .filter((p) =>
      ctx.connectedProviders.includes(p.id)
      && !failedProviderIds.includes(p.id),
    );

  if (candidates.length === 0) return null;

  const scored = candidates
    .map((p) => ({ provider: p, score: scoreProvider(p, ctx.userId, ctx.tenantId) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  recordProviderUsed(best.provider.id, ctx.userId, ctx.tenantId);

  return {
    provider: best.provider,
    score: best.score,
    reason: "fallback",
  };
}

// ── User correction detection ───────────────────────────────

const FORCE_PATTERNS: Array<{ pattern: RegExp; providerId: ProviderId }> = [
  { pattern: /\b(?:use|utilise|avec)\s+google\b/i, providerId: "google" },
  { pattern: /\b(?:use|utilise|avec)\s+slack\b/i, providerId: "slack" },
  { pattern: /\b(?:use|utilise|avec)\s+notion\b/i, providerId: "notion" },
  { pattern: /\b(?:use|utilise|avec)\s+github\b/i, providerId: "github" },
  { pattern: /\b(?:use|utilise|avec)\s+drive\b/i, providerId: "google" },
  { pattern: /\b(?:use|utilise|avec)\s+gmail\b/i, providerId: "google" },
  { pattern: /\b(?:use|utilise|avec)\s+jira\b/i, providerId: "jira" },
  { pattern: /\b(?:use|utilise|avec)\s+hubspot\b/i, providerId: "hubspot" },
  { pattern: /\b(?:use|utilise|avec)\s+figma\b/i, providerId: "figma" },
  { pattern: /\b(?:use|utilise|avec)\s+airtable\b/i, providerId: "airtable" },
  { pattern: /\b(?:use|utilise|avec)\s+stripe\b/i, providerId: "stripe" },
  { pattern: /\b(?:use|utilise|avec)\s+zapier\b/i, providerId: "zapier" },
];

/**
 * Detect if user input contains an explicit provider preference.
 * Returns the forced ProviderId or null.
 */
export function detectForcedProvider(userInput: string): ProviderId | null {
  for (const { pattern, providerId } of FORCE_PATTERNS) {
    if (pattern.test(userInput)) return providerId;
  }
  return null;
}

/**
 * Runtime boundary helper — safely cast a string to ProviderId.
 * Returns null if the string is not a known provider.
 */
export function toProviderId(value: string): ProviderId | null {
  return isProviderId(value) ? value : null;
}
