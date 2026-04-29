/**
 * runReport — orchestrateur du pipeline déterministe.
 *
 *   1. Valide le Spec (Zod, déjà fait en amont si parseReportSpec) + DAG cohérent
 *   2. Fetch sources (déléguée à un sourceLoader injectable — voir P1.4 adapters)
 *   3. applyTransforms (cache L2)
 *   4. renderBlocks (JSON payload)
 *   5. Cache L3 hit-or-miss avant narrate (économie LLM)
 *   6. narrate (single LLM call, cached)
 *
 * Le pipeline ne persiste PAS l'asset ni n'émet d'event — cela revient au
 * caller (route API, mission scheduler), qui sait où contextualiser
 * (threadId, tenantId, etc.).
 */

import type { ReportSpec, SourceRef } from "@/lib/reports/spec/schema";
import type { Tabular } from "./tabular";
import { applyTransforms } from "./apply-transforms";
import { renderBlocks, type RenderPayload } from "./render-blocks";
import { narrate } from "./narrate";
import {
  getRenderCache,
  setRenderCache,
  hashKey,
} from "./cache";
import {
  extractSignals,
  type BusinessSignal,
} from "@/lib/reports/signals/extract";
import type { Severity } from "@/lib/reports/signals/types";
import { checkReportBudget } from "./cost-meter";

// ── Source loader (injection pour tests / P1.4) ────────────

export type SourceLoader = (
  sources: ReadonlyArray<SourceRef>,
  scope: ReportSpec["scope"],
) => Promise<Map<string, Tabular>>;

/**
 * Loader stub — utilisé en V1 tant que les vrais adapters Composio/Google
 * ne sont pas livrés (P1.4). Retourne des tableaux vides.
 */
const stubLoader: SourceLoader = async () => new Map();

// ── runReport ──────────────────────────────────────────────

export interface RunReportOptions {
  /** Loader injecté ; par défaut stub vide. P1.4 fournira l'implémentation prod. */
  sourceLoader?: SourceLoader;
  /** Désactive le cache (utile pour tests / forçage refresh). */
  noCache?: boolean;
  /** Ancrage temporel pour les ops window/diff (déterminisme). */
  now?: number;
}

export interface RunReportResult {
  payload: RenderPayload;
  narration: string | null;
  signals: BusinessSignal[];
  severity: Severity;
  cacheHit: { render: boolean };
  cost: {
    inputTokens: number;
    outputTokens: number;
    /** USD calculé via lib/reports/engine/cost-meter.ts (estimation Anthropic). */
    usd: number;
    /** True si > REPORT_BUDGET_USD (0.20). */
    exceeded: boolean;
  };
  durationMs: number;
}

export async function runReport(
  spec: ReportSpec,
  options: RunReportOptions = {},
): Promise<RunReportResult> {
  const t0 = Date.now();
  const now = options.now ?? t0;
  const sourceLoader = options.sourceLoader ?? stubLoader;

  // ── 1. Fetch sources ────────────────────────────────────
  const sources = await sourceLoader(spec.sources, spec.scope);

  // ── 2. Transforms ────────────────────────────────────────
  const datasets = await applyTransforms(sources, spec.transforms, {
    cacheTtlSeconds: spec.cacheTTL.transform,
    noCache: options.noCache,
    now,
  });

  // ── 3. Render payload ───────────────────────────────────
  const payload = renderBlocks(spec, datasets, now);
  const payloadHash = hashKey(payload.blocks);

  // ── 4. Extraction signaux (déterministe, hors cache) ────
  const { signals, severity } = extractSignals(payload);

  // ── 5. L3 render cache check ─────────────────────────────
  if (!options.noCache) {
    const cached = await getRenderCache({
      specId: spec.id,
      version: spec.version,
      payloadHash,
    });
    if (cached) {
      return {
        payload: cached.payload as RenderPayload,
        narration: cached.narration,
        signals,
        severity,
        cacheHit: { render: true },
        cost: { inputTokens: 0, outputTokens: 0, usd: 0, exceeded: false },
        durationMs: Date.now() - t0,
      };
    }
  }

  // ── 6. Narrate (single LLM call) ─────────────────────────
  const narrationResult = await narrate({ spec, payload });

  // ── 7. L3 render cache write (fire-and-forget) ──────────
  if (!options.noCache) {
    void setRenderCache(
      { specId: spec.id, version: spec.version, payloadHash },
      { payload, narration: narrationResult?.text ?? null },
      spec.cacheTTL.render,
    );
  }

  const usage = {
    inputTokens: narrationResult?.inputTokens ?? 0,
    outputTokens: narrationResult?.outputTokens ?? 0,
  };
  const budget = checkReportBudget(usage);
  if (budget.exceeded) {
    console.warn(
      `[runReport] budget dépassé: $${budget.usd.toFixed(4)} > $${budget.budgetUsd.toFixed(2)} (spec=${spec.id})`,
    );
  }

  return {
    payload,
    narration: narrationResult?.text ?? null,
    signals,
    severity,
    cacheHit: { render: false },
    cost: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      usd: budget.usd,
      exceeded: budget.exceeded,
    },
    durationMs: Date.now() - t0,
  };
}
