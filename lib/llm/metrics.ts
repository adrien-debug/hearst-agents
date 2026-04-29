import { z } from "zod";

/**
 * In-memory LLM metrics aggregator.
 *
 * Collects observability signals across providers without touching any
 * persistent store — process-local, reset on restart. Designed to be cheap
 * (O(1) per record, bounded memory via rolling windows) so we can sprinkle
 * `recordCall()` / `recordError()` calls across the LLM router without
 * worrying about hot-path overhead.
 *
 * Aggregates :
 *  - Cache hit rate Anthropic (read tokens / total input tokens)
 *  - Latence par provider (p50, p95, p99) — rolling window 100 derniers calls
 *  - Coût estimé cumulé par provider (sur la base des prix Anthropic / OpenAI / Gemini)
 *  - Taux d'erreur par provider + par errorCode
 *  - Compteurs : circuit breaker trips, rate limit hits, tool loops détectés
 *
 * Snapshot via `getMetrics()`.
 *
 * NB: la persistance long-terme (audit, billing) doit aller dans la table
 * `runs` / `model_usage` — ce module est pour le tableau de bord live.
 */

// -----------------------------------------------------------------------------
// Constantes nommées (pas de magic numbers)
// -----------------------------------------------------------------------------

/** Rolling window size for latency samples (per provider). */
export const LATENCY_WINDOW_SIZE = 100;

/** Anthropic cache pricing : read tokens are billed at ~10 % of standard input rate. */
export const ANTHROPIC_CACHE_READ_DISCOUNT = 0.1;

/** Anthropic cache pricing : creation tokens cost 1.25× standard input rate. */
export const ANTHROPIC_CACHE_CREATION_PREMIUM = 1.25;

/** Tokens per "thousand" unit used by every public price sheet. */
export const PRICING_TOKEN_UNIT = 1000;

/**
 * Per-provider/model price table (USD per 1000 tokens). Used as a fallback when
 * no `cost_per_1k_in` / `cost_per_1k_out` was provided by the caller. Numbers
 * are rough public list prices as of 2026 and intended for cost estimation —
 * billing should always use the per-profile prices recorded in DB.
 */
export const DEFAULT_PRICING: Record<string, { in: number; out: number }> = {
  // Anthropic
  "claude-opus-4": { in: 15, out: 75 },
  "claude-sonnet-4": { in: 3, out: 15 },
  "claude-haiku-4": { in: 0.8, out: 4 },
  // OpenAI
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4.1": { in: 3, out: 12 },
  // Gemini
  "gemini-2.5-pro": { in: 1.25, out: 5 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "gemini-3-flash-preview": { in: 0.3, out: 2.5 },
};

// -----------------------------------------------------------------------------
// Types & schemas
// -----------------------------------------------------------------------------

const RecordCallSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  latencyMs: z.number().nonnegative().finite(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
  cacheCreationTokens: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().finite().optional(),
  costPer1kIn: z.number().nonnegative().finite().optional(),
  costPer1kOut: z.number().nonnegative().finite().optional(),
});

export type RecordCallInput = z.infer<typeof RecordCallSchema>;

const RecordErrorSchema = z.object({
  provider: z.string().min(1),
  errorCode: z.string().min(1).default("UNKNOWN"),
});

export type RecordErrorInput = z.infer<typeof RecordErrorSchema>;

const CounterKindSchema = z.enum([
  "circuit_breaker_trip",
  "rate_limit_hit",
  "tool_loop_detected",
]);

export type CounterKind = z.infer<typeof CounterKindSchema>;

interface ProviderState {
  /** Rolling latency samples (oldest first). Capped at LATENCY_WINDOW_SIZE. */
  latencies: number[];
  totalCalls: number;
  totalErrors: number;
  /** Per-errorCode counts (e.g. RATE_LIMIT_EXCEEDED, LLM_TIMEOUT, ...). */
  errorsByCode: Map<string, number>;
  totalCostUsd: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
}

interface CounterState {
  circuitBreakerTrips: number;
  rateLimitHits: number;
  toolLoopsDetected: number;
}

// -----------------------------------------------------------------------------
// Snapshot shape (what `/api/admin/llm-metrics` returns)
// -----------------------------------------------------------------------------

export interface ProviderMetrics {
  provider: string;
  totalCalls: number;
  totalErrors: number;
  errorRate: number;
  errorsByCode: Record<string, number>;
  latency: {
    samples: number;
    p50: number | null;
    p95: number | null;
    p99: number | null;
  };
  cost: {
    totalUsd: number;
    avgPerCallUsd: number | null;
  };
  tokens: {
    totalIn: number;
    totalOut: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    /** Anthropic-only : cache_read / (cache_read + uncached_input). null si non applicable. */
    cacheHitRate: number | null;
  };
}

export interface MetricsSnapshot {
  generatedAt: string;
  uptimeSeconds: number;
  providers: ProviderMetrics[];
  counters: {
    circuitBreakerTrips: number;
    rateLimitHits: number;
    toolLoopsDetected: number;
  };
}

// -----------------------------------------------------------------------------
// Aggregator
// -----------------------------------------------------------------------------

export class LLMMetricsAggregator {
  private providers = new Map<string, ProviderState>();
  private counters: CounterState = {
    circuitBreakerTrips: 0,
    rateLimitHits: 0,
    toolLoopsDetected: 0,
  };
  private startedAt = Date.now();

  /** Record a successful (or at least completed) LLM call. */
  recordCall(input: RecordCallInput): void {
    const parsed = RecordCallSchema.parse(input);
    const state = this.getOrCreate(parsed.provider);

    state.totalCalls++;
    state.latencies.push(parsed.latencyMs);
    if (state.latencies.length > LATENCY_WINDOW_SIZE) {
      state.latencies.shift();
    }

    state.totalTokensIn += parsed.tokensIn;
    state.totalTokensOut += parsed.tokensOut;
    state.totalCacheReadTokens += parsed.cacheReadTokens ?? 0;
    state.totalCacheCreationTokens += parsed.cacheCreationTokens ?? 0;

    state.totalCostUsd += this.computeCost(parsed);
  }

  /** Record an error for a provider. errorCode defaults to "UNKNOWN". */
  recordError(input: RecordErrorInput): void {
    const parsed = RecordErrorSchema.parse(input);
    const state = this.getOrCreate(parsed.provider);
    state.totalErrors++;
    const prev = state.errorsByCode.get(parsed.errorCode) ?? 0;
    state.errorsByCode.set(parsed.errorCode, prev + 1);
  }

  /** Increment a named counter. */
  incrementCounter(kind: CounterKind): void {
    const validated = CounterKindSchema.parse(kind);
    switch (validated) {
      case "circuit_breaker_trip":
        this.counters.circuitBreakerTrips++;
        break;
      case "rate_limit_hit":
        this.counters.rateLimitHits++;
        break;
      case "tool_loop_detected":
        this.counters.toolLoopsDetected++;
        break;
    }
  }

  /** Reset all aggregates. Mainly for tests. */
  reset(): void {
    this.providers.clear();
    this.counters = {
      circuitBreakerTrips: 0,
      rateLimitHits: 0,
      toolLoopsDetected: 0,
    };
    this.startedAt = Date.now();
  }

  /** Return a structured JSON snapshot of current metrics. */
  getMetrics(): MetricsSnapshot {
    const providers: ProviderMetrics[] = [];
    for (const [name, state] of this.providers.entries()) {
      providers.push(this.buildProviderMetrics(name, state));
    }
    providers.sort((a, b) => a.provider.localeCompare(b.provider));

    return {
      generatedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      providers,
      counters: { ...this.counters },
    };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private getOrCreate(provider: string): ProviderState {
    let state = this.providers.get(provider);
    if (!state) {
      state = {
        latencies: [],
        totalCalls: 0,
        totalErrors: 0,
        errorsByCode: new Map(),
        totalCostUsd: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        totalCacheReadTokens: 0,
        totalCacheCreationTokens: 0,
      };
      this.providers.set(provider, state);
    }
    return state;
  }

  private computeCost(parsed: RecordCallInput): number {
    if (parsed.costUsd != null) return parsed.costUsd;

    const pricing =
      parsed.costPer1kIn != null && parsed.costPer1kOut != null
        ? { in: parsed.costPer1kIn, out: parsed.costPer1kOut }
        : DEFAULT_PRICING[parsed.model];

    if (!pricing) return 0;

    const cacheRead = parsed.cacheReadTokens ?? 0;
    const cacheCreation = parsed.cacheCreationTokens ?? 0;
    const uncachedIn = Math.max(0, parsed.tokensIn - cacheRead - cacheCreation);

    const inputCost =
      (uncachedIn / PRICING_TOKEN_UNIT) * pricing.in +
      (cacheRead / PRICING_TOKEN_UNIT) * pricing.in * ANTHROPIC_CACHE_READ_DISCOUNT +
      (cacheCreation / PRICING_TOKEN_UNIT) * pricing.in * ANTHROPIC_CACHE_CREATION_PREMIUM;

    const outputCost = (parsed.tokensOut / PRICING_TOKEN_UNIT) * pricing.out;

    return inputCost + outputCost;
  }

  private buildProviderMetrics(name: string, state: ProviderState): ProviderMetrics {
    const sorted = [...state.latencies].sort((a, b) => a - b);
    const total = state.totalCalls + state.totalErrors;
    const errorRate = total === 0 ? 0 : state.totalErrors / total;

    const cacheTotal =
      state.totalCacheReadTokens + (state.totalTokensIn - state.totalCacheCreationTokens);
    const cacheHitRate =
      state.totalCacheReadTokens > 0 && cacheTotal > 0
        ? state.totalCacheReadTokens / cacheTotal
        : null;

    const errorsByCode: Record<string, number> = {};
    for (const [code, count] of state.errorsByCode.entries()) {
      errorsByCode[code] = count;
    }

    return {
      provider: name,
      totalCalls: state.totalCalls,
      totalErrors: state.totalErrors,
      errorRate,
      errorsByCode,
      latency: {
        samples: sorted.length,
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        p99: percentile(sorted, 0.99),
      },
      cost: {
        totalUsd: round4(state.totalCostUsd),
        avgPerCallUsd:
          state.totalCalls === 0 ? null : round4(state.totalCostUsd / state.totalCalls),
      },
      tokens: {
        totalIn: state.totalTokensIn,
        totalOut: state.totalTokensOut,
        cacheReadTokens: state.totalCacheReadTokens,
        cacheCreationTokens: state.totalCacheCreationTokens,
        cacheHitRate: cacheHitRate == null ? null : round4(cacheHitRate),
      },
    };
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Linear-interpolation percentile over an already-sorted array.
 * Returns null on empty input.
 *
 * Example: percentile([1, 2, 3, 4], 0.5) === 2.5
 */
export function percentile(sortedAsc: number[], q: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const clampedQ = Math.min(1, Math.max(0, q));
  const pos = clampedQ * (sortedAsc.length - 1);
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sortedAsc[Math.min(base + 1, sortedAsc.length - 1)];
  return sortedAsc[base] + rest * (next - sortedAsc[base]);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// -----------------------------------------------------------------------------
// Default singleton + convenience exports
// -----------------------------------------------------------------------------

export const defaultMetrics = new LLMMetricsAggregator();

/** Convenience snapshot accessor (exported so callers don't need the singleton). */
export function getMetrics(): MetricsSnapshot {
  return defaultMetrics.getMetrics();
}
