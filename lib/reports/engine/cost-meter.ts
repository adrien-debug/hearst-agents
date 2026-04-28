/**
 * Cost meter pour les runs de report.
 *
 * Convertit les tokens consommés par la narration LLM en USD selon le
 * pricing Anthropic. Les valeurs sont des estimations — la facture exacte
 * vient du tableau de bord Anthropic ; ici on a une approximation utile
 * pour le budget par run et les assertions de tests.
 *
 * Pricing au 2026-04 (Claude Sonnet 4-6, USD / 1M tokens) :
 *   - input  : 3.00
 *   - output : 15.00
 *   - cache write (1× input) : 3.75
 *   - cache read (90% off)  : 0.30
 *
 * Mettre à jour PRICING quand Anthropic change ses tarifs.
 */

export interface ModelPricing {
  /** USD par 1M tokens d'input non-cached. */
  input: number;
  /** USD par 1M tokens d'output. */
  output: number;
  /** USD par 1M tokens de cache write. */
  cacheWrite: number;
  /** USD par 1M tokens de cache read (hits). */
  cacheRead: number;
}

export const SONNET_4_6_PRICING: ModelPricing = {
  input: 3.0,
  output: 15.0,
  cacheWrite: 3.75,
  cacheRead: 0.3,
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

/**
 * Compute le coût USD pour une consommation de tokens donnée.
 * Si cacheReadTokens est fourni, les inputTokens représentent les tokens
 * NON cachés (Anthropic les sépare). Sinon on assume tout en input non-cached.
 */
export function computeCostUsd(usage: TokenUsage, pricing: ModelPricing = SONNET_4_6_PRICING): number {
  const usd =
    (usage.inputTokens * pricing.input +
      usage.outputTokens * pricing.output +
      (usage.cacheCreationTokens ?? 0) * pricing.cacheWrite +
      (usage.cacheReadTokens ?? 0) * pricing.cacheRead) /
    1_000_000;
  return Math.round(usd * 10000) / 10000;
}

/**
 * Budget par run de report. Au-delà, log un warning. Les reports cold avec
 * narration courte doivent rester largement sous ce seuil.
 */
export const REPORT_BUDGET_USD = 0.2;
export const REPORT_BUDGET_WARN_RATIO = 0.8;

export interface CostCheck {
  usd: number;
  exceeded: boolean;
  warning: boolean;
  budgetUsd: number;
}

export function checkReportBudget(usage: TokenUsage): CostCheck {
  const usd = computeCostUsd(usage);
  return {
    usd,
    exceeded: usd > REPORT_BUDGET_USD,
    warning: usd >= REPORT_BUDGET_USD * REPORT_BUDGET_WARN_RATIO,
    budgetUsd: REPORT_BUDGET_USD,
  };
}
