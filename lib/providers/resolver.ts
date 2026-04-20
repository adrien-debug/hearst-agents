/**
 * Intelligent Provider Resolver — Production-hardened.
 *
 * Scoring algorithm combines:
 *   - static registry priority
 *   - runtime success rate (with failure cooldown penalty)
 *   - exponential recency decay
 *   - usage frequency
 *   - stickiness bonus (inertia within a session)
 *   - cold-start exploration
 *
 * Safety features:
 *   - fallback chain depth limit (max 3)
 *   - failure cooldown window
 *   - multi-tenant isolation assertions
 *   - observability hooks (debug mode)
 */

import type { ConnectorCapability } from "@/lib/connectors/platform/types";
import type { ProviderId, ProviderDefinition } from "./types";
import { isProviderId } from "./types";
import { getProvidersByCapability, getProviderById, getAllProviders } from "./registry";
import { getUsageState, recordProviderUsed } from "./state";

// ── Configuration ───────────────────────────────────────────

const WEIGHT_PRIORITY = 1.0;
const WEIGHT_USAGE = 0.5;
const WEIGHT_RECENCY = 0.3;
const WEIGHT_SUCCESS = 2.0;
const WEIGHT_STICKINESS = 1.5;

/** Exponential decay lambda — 50% decay at 24h. */
const RECENCY_LAMBDA = Math.LN2 / (24 * 60 * 60 * 1000);

/** Provider stays sticky for this window after selection. */
const STICKINESS_WINDOW_MS = 10 * 60 * 1000; // 10 min

/** After failure, apply penalty for this window. */
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000; // 5 min
const FAILURE_PENALTY = 3.0;

/** Maximum fallback attempts per run. */
const MAX_FALLBACK_DEPTH = 3;

/** Small jitter for cold-start exploration among top candidates. */
const COLD_START_JITTER = 0.5;

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

export interface FallbackResult extends ResolverResult {
  fallbackDepth: number;
  degraded: boolean;
}

// ── Observability ───────────────────────────────────────────

export interface ResolverDecisionLog {
  capability: ConnectorCapability;
  candidates: Array<{ id: ProviderId; score: number }>;
  selectedProvider: ProviderId;
  reason: string;
  stickiness: boolean;
  coldStart: boolean;
}

type ResolverLogger = (decision: ResolverDecisionLog) => void;
let resolverLogger: ResolverLogger | null = null;

export function setResolverLogger(logger: ResolverLogger | null): void {
  resolverLogger = logger;
}

// ── Tenant guard ────────────────────────────────────────────

function assertTenantScope(userId: string, tenantId: string): void {
  if (!tenantId || !userId) {
    throw new Error(
      `[Resolver] Missing tenant scope: userId=${userId || "MISSING"} tenantId=${tenantId || "MISSING"}`,
    );
  }
}

// ── Scoring ─────────────────────────────────────────────────

function computeRecencyDecay(lastUsedAt: number): number {
  if (lastUsedAt === 0) return 0;
  const age = Date.now() - lastUsedAt;
  return Math.exp(-RECENCY_LAMBDA * age);
}

function computeStickinessBonus(
  provider: ProviderDefinition,
  capability: ConnectorCapability,
  userId: string,
  tenantId: string,
): number {
  const usage = getUsageState(provider.id, userId, tenantId);
  if (usage.lastCapability !== capability) return 0;

  const timeSinceUse = Date.now() - usage.lastUsedAt;
  if (timeSinceUse > STICKINESS_WINDOW_MS) return 0;

  const decay = 1 - timeSinceUse / STICKINESS_WINDOW_MS;
  return decay * WEIGHT_STICKINESS;
}

function computeFailurePenalty(lastFailedAt: number): number {
  if (lastFailedAt === 0) return 0;
  const timeSinceFailure = Date.now() - lastFailedAt;
  if (timeSinceFailure > FAILURE_COOLDOWN_MS) return 0;

  const intensity = 1 - timeSinceFailure / FAILURE_COOLDOWN_MS;
  return intensity * FAILURE_PENALTY;
}

function isColdStart(usageCount: number, successCount: number, failureCount: number): boolean {
  return usageCount === 0 && successCount === 0 && failureCount === 0;
}

function scoreProvider(
  provider: ProviderDefinition,
  capability: ConnectorCapability,
  userId: string,
  tenantId: string,
): { score: number; coldStart: boolean; sticky: boolean } {
  const usage = getUsageState(provider.id, userId, tenantId);

  const coldStart = isColdStart(usage.usageCount, usage.successCount, usage.failureCount);

  const priorityScore = provider.priority * WEIGHT_PRIORITY;
  const usageScore = Math.min(usage.usageCount, 100) / 100 * WEIGHT_USAGE;
  const recencyScore = computeRecencyDecay(usage.lastUsedAt) * WEIGHT_RECENCY;
  const successScore = usage.successRate * WEIGHT_SUCCESS;
  const stickyBonus = computeStickinessBonus(provider, capability, userId, tenantId);
  const failurePenalty = computeFailurePenalty(usage.lastFailedAt);

  let score = priorityScore + usageScore + recencyScore + successScore + stickyBonus - failurePenalty;

  if (coldStart) {
    score += (Math.random() - 0.5) * COLD_START_JITTER;
  }

  return { score, coldStart, sticky: stickyBonus > 0 };
}

// ── Core resolver ───────────────────────────────────────────

export function resolveProvider(ctx: ResolverContext): ResolverResultWithFallbacks | null {
  assertTenantScope(ctx.userId, ctx.tenantId);

  // ── Forced provider ─────────────────────────────────────
  if (ctx.forcedProviderId) {
    const forced = getProviderById(ctx.forcedProviderId);
    if (forced) {
      recordProviderUsed(forced.id, ctx.userId, ctx.tenantId, ctx.capability);

      const remaining = getProvidersByCapability(ctx.capability)
        .filter((p) => p.id !== forced.id && ctx.connectedProviders.includes(p.id));

      logDecision(ctx.capability, [{ id: forced.id, score: Infinity }], forced.id, "forced", false, false);

      return {
        provider: forced,
        score: Infinity,
        reason: "forced",
        fallbacks: remaining.slice(0, MAX_FALLBACK_DEPTH),
      };
    }
  }

  // ── Capability-based resolution (indexed lookup) ────────
  const candidates = getProvidersByCapability(ctx.capability)
    .filter((p) => ctx.connectedProviders.includes(p.id));

  if (candidates.length === 0) return null;

  if (candidates.length === 1) {
    recordProviderUsed(candidates[0].id, ctx.userId, ctx.tenantId, ctx.capability);
    const { score } = scoreProvider(candidates[0], ctx.capability, ctx.userId, ctx.tenantId);

    logDecision(ctx.capability, [{ id: candidates[0].id, score }], candidates[0].id, "only_option", false, false);

    return {
      provider: candidates[0],
      score,
      reason: "only_option",
      fallbacks: [],
    };
  }

  // ── Score and rank ──────────────────────────────────────
  const scored = candidates
    .map((p) => {
      const s = scoreProvider(p, ctx.capability, ctx.userId, ctx.tenantId);
      return { provider: p, ...s };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  recordProviderUsed(best.provider.id, ctx.userId, ctx.tenantId, ctx.capability);

  logDecision(
    ctx.capability,
    scored.map((s) => ({ id: s.provider.id, score: s.score })),
    best.provider.id,
    "scored",
    best.sticky,
    best.coldStart,
  );

  return {
    provider: best.provider,
    score: best.score,
    reason: "scored",
    fallbacks: scored.slice(1, MAX_FALLBACK_DEPTH + 1).map((s) => s.provider),
  };
}

/**
 * Attempt the next fallback provider after a failure.
 * Returns null if no fallbacks remain or depth exceeded.
 */
export function resolveFallback(
  ctx: ResolverContext,
  failedProviderIds: ProviderId[],
): FallbackResult | null {
  assertTenantScope(ctx.userId, ctx.tenantId);

  const depth = failedProviderIds.length;

  if (depth >= MAX_FALLBACK_DEPTH) {
    return null;
  }

  const candidates = getProvidersByCapability(ctx.capability)
    .filter((p) =>
      ctx.connectedProviders.includes(p.id)
      && !failedProviderIds.includes(p.id),
    );

  if (candidates.length === 0) return null;

  const scored = candidates
    .map((p) => ({
      provider: p,
      ...scoreProvider(p, ctx.capability, ctx.userId, ctx.tenantId),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  recordProviderUsed(best.provider.id, ctx.userId, ctx.tenantId, ctx.capability);

  return {
    provider: best.provider,
    score: best.score,
    reason: "fallback",
    fallbackDepth: depth + 1,
    degraded: depth + 1 >= MAX_FALLBACK_DEPTH,
  };
}

// ── User correction detection (noise-filtered) ──────────────

/**
 * Stricter patterns — only match explicit directives.
 * "not X use Y" and "use X" / "utilise X" / "avec X" / "via X".
 * Ignores ambiguous mentions like "send a slack message".
 */
const FORCE_PATTERNS: Array<{ pattern: RegExp; resolve: (match: RegExpMatchArray) => ProviderId | null }> = [
  {
    pattern: /\b(?:pas|not)\s+\w+[,.]?\s*(?:use|utilise|avec|via)\s+(\w+)\b/i,
    resolve: (m) => matchProviderName(m[1]),
  },
  {
    pattern: /\b(?:use|utilise|avec|via)\s+(\w+)\b/i,
    resolve: (m) => matchProviderName(m[1]),
  },
];

const PROVIDER_NAME_MAP = new Map<string, ProviderId>();

function ensureNameMap(): void {
  if (PROVIDER_NAME_MAP.size > 0) return;
  for (const p of getAllProviders()) {
    PROVIDER_NAME_MAP.set(p.id.toLowerCase(), p.id);
    PROVIDER_NAME_MAP.set(p.label.toLowerCase(), p.id);
  }
  PROVIDER_NAME_MAP.set("gmail", "google");
  PROVIDER_NAME_MAP.set("drive", "google");
  PROVIDER_NAME_MAP.set("calendar", "google");
}

function matchProviderName(name: string): ProviderId | null {
  ensureNameMap();
  return PROVIDER_NAME_MAP.get(name.toLowerCase()) ?? null;
}

export function detectForcedProvider(userInput: string): ProviderId | null {
  for (const { pattern, resolve } of FORCE_PATTERNS) {
    const match = userInput.match(pattern);
    if (match) {
      const id = resolve(match);
      if (id) return id;
    }
  }
  return null;
}

/**
 * Runtime boundary helper — safely cast a string to ProviderId.
 */
export function toProviderId(value: string): ProviderId | null {
  return isProviderId(value) ? value : null;
}

// ── Observability helper ────────────────────────────────────

function logDecision(
  capability: ConnectorCapability,
  candidates: Array<{ id: ProviderId; score: number }>,
  selectedProvider: ProviderId,
  reason: string,
  stickiness: boolean,
  coldStart: boolean,
): void {
  if (!resolverLogger) return;
  resolverLogger({ capability, candidates, selectedProvider, reason, stickiness, coldStart });
}

// ── Exports for testing ─────────────────────────────────────

export const _testing = {
  MAX_FALLBACK_DEPTH,
  STICKINESS_WINDOW_MS,
  FAILURE_COOLDOWN_MS,
  computeRecencyDecay,
  computeFailurePenalty,
} as const;
