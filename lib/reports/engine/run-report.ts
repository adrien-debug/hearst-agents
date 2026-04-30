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
import { renderBlocks, type RenderPayload, type RenderedSource } from "./render-blocks";
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
import { checkReportBudget, REPORT_BUDGET_USD, SONNET_4_6_PRICING } from "./cost-meter";

/** Prix output Sonnet 4-6 en USD/1M tokens (utilisé pour l'estimation pré-call). */
const SONNET_OUTPUT_PRICE_PER_M = SONNET_4_6_PRICING.output;
import type {
  DispatchAlertsInput,
  DispatchAlertsResult,
} from "@/lib/notifications/alert-dispatcher";

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

/**
 * Dérive la liste de sources citables depuis `spec.sources`. Le label par
 * défaut combine `kind` et `id` quand pas de label explicite. URL externe
 * extraite quand kind === "http". Pas d'effet sur les sources de type
 * composio/native_google/asset (drill-down se fera côté UI selon kind).
 */
function deriveSources(sources: ReadonlyArray<SourceRef>, fetchedAt: number): RenderedSource[] {
  return sources.map((s) => {
    const out: RenderedSource = {
      id: s.id,
      label: s.label ?? `${s.kind}:${s.id}`,
      fetchedAt,
    };
    if (s.kind === "http") {
      const url = (s.spec as { url?: string }).url;
      if (typeof url === "string") out.url = url;
    } else if (s.kind === "asset") {
      const assetId = (s.spec as { assetId?: string }).assetId;
      if (typeof assetId === "string") out.assetId = assetId;
    }
    return out;
  });
}

// ── runReport ──────────────────────────────────────────────

/**
 * Hook d'alerting injecté. Reçoit la liste de signaux ET la spec courante.
 * Permet au caller de brancher `dispatchAlerts` (Supabase + canaux) sans
 * que `run-report` n'importe la stack alerting au runtime — un
 * import paresseux de `lib/notifications` n'est pas idéal ici car cela
 * créerait une dépendance circulaire (alert-dispatcher → settings → ...).
 *
 * Convention : best-effort. Une exception du dispatcher est loggée mais
 * NE casse PAS le report.
 */
export type AlertDispatcher = (
  input: Pick<DispatchAlertsInput, "tenantId" | "signals" | "report">,
) => Promise<DispatchAlertsResult>;

export interface RunReportOptions {
  /** Loader injecté ; par défaut stub vide. P1.4 fournira l'implémentation prod. */
  sourceLoader?: SourceLoader;
  /** Désactive le cache (utile pour tests / forçage refresh). */
  noCache?: boolean;
  /** Ancrage temporel pour les ops window/diff (déterminisme). */
  now?: number;
  /**
   * Dispatcher d'alerting opt-in. Si fourni, est appelé après extractSignals
   * avec les signaux dont la sévérité ≥ "critical" (le filtre fin est appliqué
   * côté dispatcher via `severityFloor`).
   */
  alertDispatcher?: AlertDispatcher;
  /**
   * Versioning opt-in. Si `enabled: true` et `assetId` fourni, une version est
   * créée automatiquement après un run réussi.
   * Activé par défaut quand `assetId` est fourni.
   */
  versioning?: {
    enabled: boolean;
    assetId?: string;
    tenantId?: string;
    triggeredBy?: "manual" | "scheduled" | "api";
  };
  /**
   * Budget max en USD pour ce run. Si le coût estimé de la narration dépasse
   * cette valeur, la narration est skippée (rapport partiel retourné).
   * Défaut : REPORT_BUDGET_USD (0.20).
   * Mettre à 0 pour désactiver la narration inconditionnellement.
   */
  maxBudgetUsd?: number;
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
  // Sources citables — dérivées de spec.sources (id + label fallback). Le
  // composant ReportLayout/SourceCitation lit `payload.sources` pour wrapper
  // les `<sup data-source-id="..."/>` produits par `fmtCitation`.
  payload.sources = deriveSources(spec.sources, now);
  const payloadHash = hashKey(payload.blocks);

  // ── 4. Extraction signaux (déterministe, hors cache) ────
  const { signals, severity } = extractSignals(payload);

  // ── 4b. Alerting opt-in (best-effort, hors cache) ────────
  // Déclenché à chaque run y compris cache hit — le throttle 4h côté
  // dispatcher empêche le spam. On filtre côté caller pour n'envoyer
  // que les signaux marqués "critical" (cf prompt mission).
  if (options.alertDispatcher) {
    const critical = signals.filter((s) => s.severity === "critical");
    if (critical.length > 0) {
      try {
        await options.alertDispatcher({
          tenantId: spec.scope.tenantId,
          signals: critical,
          report: { id: spec.id, title: spec.meta.title },
        });
      } catch (err) {
        console.warn(
          `[runReport] alertDispatcher a throw — ignoré : ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

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

  // ── 6. Narrate (single LLM call) — guard budget ──────────
  const maxBudgetUsd = options.maxBudgetUsd ?? REPORT_BUDGET_USD;
  // Estimation worst-case : coût d'une narration = maxTokens output × prix output Anthropic.
  // Si la spec n'a pas de narration, l'estimation est 0.
  const narrateMaxTokens = spec.narration?.maxTokens ?? 0;
  const estimatedNarrateCostUsd =
    narrateMaxTokens > 0
      ? (narrateMaxTokens / 1_000_000) * SONNET_OUTPUT_PRICE_PER_M
      : 0;

  let budgetSkipped = false;
  if (spec.narration && estimatedNarrateCostUsd > maxBudgetUsd) {
    console.warn(
      `[runReport] narration skippée — coût estimé $${estimatedNarrateCostUsd.toFixed(4)} > budget $${maxBudgetUsd.toFixed(2)} (spec=${spec.id})`,
    );
    budgetSkipped = true;
  }

  const narrationResult = budgetSkipped ? null : await narrate({ spec, payload });

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

  const result: RunReportResult = {
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

  // ── 8b. Webhook event report.generated (fire-and-forget) ────
  try {
    const { dispatchWebhookEvent } = await import("@/lib/webhooks/dispatcher");
    dispatchWebhookEvent("report.generated", spec.scope.tenantId, {
      reportId: spec.id,
      title: spec.meta.title,
      severity,
      durationMs: result.durationMs,
    });
  } catch {
    // Webhook system unavailable — ignoré silencieusement
  }

  // ── 8. Versioning (fire-and-forget, best-effort) ─────────────
  const vOpts = options.versioning;
  if (vOpts?.enabled !== false && vOpts?.assetId && vOpts?.tenantId) {
    void (async () => {
      try {
        const { createVersion } = await import("@/lib/reports/versions/store");
        await createVersion({
          assetId: vOpts.assetId!,
          tenantId: vOpts.tenantId!,
          spec: spec as unknown as Record<string, unknown>,
          renderPayload: payload as unknown as Record<string, unknown>,
          signals: signals,
          narration: result.narration,
          triggeredBy: vOpts.triggeredBy ?? "manual",
        });
      } catch (err) {
        console.warn(
          `[runReport] versioning a throw — ignoré : ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    })();
  }

  return result;
}
