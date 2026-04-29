/**
 * Extracteur déterministe de business signals depuis un RenderPayload.
 *
 * Le LLM ne participe PAS à la décision — c'est purement règles. Garantie :
 * pour un payload donné, on émet toujours la même liste de signaux.
 *
 * Convention de scalars (sortie de renderBlocks) :
 *   "{blockId}.value"          : la valeur principale
 *   "{blockId}.delta"          : variation (en fraction, ex. 0.12 = +12%)
 *   "{blockId}.count"          : nombre de rows
 *   "{blockId}.baseline"       : référence (baseline glissante, période n-1)
 *   "{blockId}.baseline_3m"    : moyenne 3 derniers mois (cas expense_spike)
 *   "{blockId}.previous"       : valeur de la période précédente
 *   "{blockId}.mau"            : MAU associé au feature usage / headcount actif
 *
 * Les règles inspectent les block ids canoniques utilisés dans le catalogue
 * (kpi_mrr, kpi_runway, kpi_pipeline, kpi_inbox, kpi_commits, kpi_tickets,
 *  kpi_expenses, kpi_retention_c2, kpi_top_feature, kpi_nps, kpi_csat_7d,
 *  kpi_sla, kpi_lead_time, kpi_change_failure_rate, kpi_late_hours,
 *  kpi_weekend_activity, kpi_incidents, kpi_late_activity).
 */

import type { RenderPayload } from "@/lib/reports/engine/render-blocks";
import type { BusinessSignalType, Severity } from "./types";
import { determineSeverity } from "./types";

export interface BusinessSignal {
  type: BusinessSignalType;
  /** Severity recalculée localement, peut différer de la sévérité globale. */
  severity: Severity;
  /** Description courte pour la narration ou l'alerting. */
  message: string;
  /** Block id qui a déclenché le signal — utile pour drill-down côté UI. */
  blockId?: string;
}

export interface ExtractedSignals {
  signals: BusinessSignal[];
  severity: Severity;
}

// ── Constantes nommées (pas de magic numbers) ──────────────

/** Multiple sur la baseline 3m au-delà duquel on alerte un expense_spike. */
const EXPENSE_SPIKE_BASELINE_MULTIPLIER = 1.3;
/**
 * Drop minimum (en points de pourcentage exprimés en fraction) pour déclencher
 * retention_drop. C2 actual < baseline - 0.05 (5pp).
 */
const RETENTION_DROP_THRESHOLD_PP = 0.05;
/** Adoption < 20% du MAU pour le top feature → feature_adoption_low. */
const FEATURE_ADOPTION_LOW_RATIO = 0.20;
/** NPS courant < précédent - 10 points (échelle -100..100). */
const NPS_DECLINE_THRESHOLD = 10;
/** CSAT 7j < CSAT 30j baseline - 5pp. CSAT exprimé en fraction (0..1). */
const CSAT_DROP_THRESHOLD_PP = 0.05;
/** Compliance SLA < 90% → sla_breach. */
const SLA_BREACH_COMPLIANCE_THRESHOLD = 0.90;

// MRR
const MRR_DROP_CRITICAL_DELTA = -0.15;
const MRR_DROP_WARNING_DELTA = -0.05;
const MRR_SPIKE_DELTA = 0.10;

// Runway
const RUNWAY_CRITICAL_MONTHS = 6;
const RUNWAY_WARNING_MONTHS = 9;

// Pipeline
const PIPELINE_THIN_VALUE = 50_000;

// Support
const INBOX_OVERLOAD = 50;
const TICKETS_AT_RISK = 5;

// Velocity / cycle
const COMMIT_VELOCITY_DROP_DELTA = -0.30;
const CYCLE_TIME_DRIFT_DELTA = 0.20;

// Calendar
const CALENDAR_OVERLOAD = 25;
/** Heures de meeting hebdo au-delà desquelles on alerte meeting_overload. */
const MEETING_OVERLOAD_HOURS = 30;

// Engineering velocity (DORA)
/** Multiple sur la baseline de lead time au-delà duquel on alerte. */
const LEAD_TIME_DRIFT_MULTIPLIER = 1.3;
/** Change Failure Rate critique au-delà de 15%. */
const CHANGE_FAILURE_THRESHOLD = 0.15;

// HR — burnout
/** Ratio late-hours / MAU au-delà duquel on alerte. */
const BURNOUT_HOURS_RATIO = 0.30;
/** Ratio weekend-activity / MAU au-delà duquel on alerte. */
const BURNOUT_WEEKEND_RATIO = 0.20;
/**
 * Ratio late-hours / total-hours au-delà duquel on alerte (sans MAU).
 * Heures soir+weekend sur total des heures envoyées.
 */
const BURNOUT_LATE_ACTIVITY_RATIO = 0.25;

// Engineering — incidents
/** Multiple sur la baseline 4w au-delà duquel on alerte un incident_spike. */
const INCIDENT_SPIKE_BASELINE_MULTIPLIER = 1.5;

/**
 * Lit un scalar typé number ; retourne null si absent ou non finite.
 */
function readNumber(scalars: Record<string, unknown>, key: string): number | null {
  const v = scalars[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

/**
 * Règle simple : un seul scalar `{blockId}.{field}` + predicate.
 */
interface SimpleRule {
  kind: "simple";
  blockId: string;
  field: "value" | "delta" | "count";
  predicate: (n: number) => boolean;
  signal: BusinessSignalType;
  severity: Severity;
  build: (n: number) => string;
}

/**
 * Règle composite : plusieurs scalaires lus, predicate sur la map.
 * Permet de comparer current vs baseline (expense_spike, retention_drop, ...).
 */
interface CompositeRule {
  kind: "composite";
  blockId: string;
  /** Liste de fields à lire. Tous doivent être présents finis sinon skip. */
  fields: ReadonlyArray<string>;
  predicate: (values: Readonly<Record<string, number>>) => boolean;
  signal: BusinessSignalType;
  severity: Severity;
  build: (values: Readonly<Record<string, number>>) => string;
}

type Rule = SimpleRule | CompositeRule;

/**
 * Règles triées par priorité — premier match gagne pour le même signal type.
 * Note : on émet TOUS les signaux qui matchent (un report peut déclencher
 * plusieurs alertes). Les rules contradictoires (ex. mrr_drop ET mrr_spike)
 * sont mutuellement exclusives par construction (predicates opposés).
 */
const RULES: ReadonlyArray<Rule> = [
  // ── MRR ──────────────────────────────────────────────────
  {
    kind: "simple",
    blockId: "kpi_mrr",
    field: "delta",
    predicate: (n) => n <= MRR_DROP_CRITICAL_DELTA,
    signal: "mrr_drop",
    severity: "critical",
    build: (n) => `MRR en chute de ${(n * 100).toFixed(1)}% vs période précédente`,
  },
  {
    kind: "simple",
    blockId: "kpi_mrr",
    field: "delta",
    predicate: (n) => n < MRR_DROP_WARNING_DELTA && n > MRR_DROP_CRITICAL_DELTA,
    signal: "mrr_drop",
    severity: "warning",
    build: (n) => `MRR en baisse de ${(n * 100).toFixed(1)}% vs période précédente`,
  },
  {
    kind: "simple",
    blockId: "kpi_mrr",
    field: "delta",
    predicate: (n) => n >= MRR_SPIKE_DELTA,
    signal: "mrr_spike",
    severity: "info",
    build: (n) => `MRR en hausse de +${(n * 100).toFixed(1)}% vs période précédente`,
  },

  // ── Runway (mois) ────────────────────────────────────────
  {
    kind: "simple",
    blockId: "kpi_runway",
    field: "value",
    predicate: (n) => n < RUNWAY_CRITICAL_MONTHS,
    signal: "runway_risk",
    severity: "critical",
    build: (n) => `Runway critique : ${n.toFixed(1)} mois restants`,
  },
  {
    kind: "simple",
    blockId: "kpi_runway",
    field: "value",
    predicate: (n) => n >= RUNWAY_CRITICAL_MONTHS && n < RUNWAY_WARNING_MONTHS,
    signal: "runway_risk",
    severity: "warning",
    build: (n) => `Runway tendu : ${n.toFixed(1)} mois restants`,
  },

  // ── Pipeline value ───────────────────────────────────────
  {
    kind: "simple",
    blockId: "kpi_pipeline",
    field: "value",
    predicate: (n) => n < PIPELINE_THIN_VALUE,
    signal: "pipeline_thin",
    severity: "warning",
    build: (n) => `Pipeline ouvert faible : ${n.toLocaleString("fr-FR")}`,
  },

  // ── Inbox backlog ────────────────────────────────────────
  {
    kind: "simple",
    blockId: "kpi_inbox",
    field: "value",
    predicate: (n) => n >= INBOX_OVERLOAD,
    signal: "support_overload",
    severity: "warning",
    build: (n) => `${n} emails en attente — backlog`,
  },

  // ── Tickets ouverts (Customer 360) ───────────────────────
  {
    kind: "simple",
    blockId: "kpi_tickets",
    field: "value",
    predicate: (n) => n >= TICKETS_AT_RISK,
    signal: "customer_at_risk",
    severity: "warning",
    build: (n) => `${n} tickets ouverts pour ce client`,
  },

  // ── Commits velocity drop ────────────────────────────────
  {
    kind: "simple",
    blockId: "kpi_commits",
    field: "delta",
    predicate: (n) => n <= COMMIT_VELOCITY_DROP_DELTA,
    signal: "commit_velocity_drop",
    severity: "warning",
    build: (n) => `Vélocité commits en baisse de ${(n * 100).toFixed(0)}%`,
  },

  // ── Cycle time drift (Deal-to-Cash) ──────────────────────
  {
    kind: "simple",
    blockId: "kpi_cycle",
    field: "delta",
    predicate: (n) => n >= CYCLE_TIME_DRIFT_DELTA,
    signal: "cycle_time_drift",
    severity: "warning",
    build: (n) => `Cycle time s'allonge de +${(n * 100).toFixed(0)}%`,
  },

  // ── Calendar overload ────────────────────────────────────
  {
    kind: "simple",
    blockId: "kpi_meetings",
    field: "value",
    predicate: (n) => n >= CALENDAR_OVERLOAD,
    signal: "calendar_overload",
    severity: "warning",
    build: (n) => `${n} réunions cette semaine — agenda saturé`,
  },

  // ── Meeting overload (en heures / semaine) ────────────────
  // Distinct de calendar_overload (qui compte le nombre de réunions).
  // kpi_meeting_hours.value = total heures meeting sur 7j (HR / People).
  {
    kind: "simple",
    blockId: "kpi_meeting_hours",
    field: "value",
    predicate: (n) => n > MEETING_OVERLOAD_HOURS,
    signal: "meeting_overload",
    severity: "warning",
    build: (n) => `${n.toFixed(1)}h de meetings cette semaine (>${MEETING_OVERLOAD_HOURS}h)`,
  },

  // ── Expense spike : current > baseline_3m * 1.3 ──────────
  {
    kind: "composite",
    blockId: "kpi_expenses",
    fields: ["value", "baseline_3m"],
    predicate: ({ value, baseline_3m }) =>
      baseline_3m > 0 && value > baseline_3m * EXPENSE_SPIKE_BASELINE_MULTIPLIER,
    signal: "expense_spike",
    severity: "critical",
    build: ({ value, baseline_3m }) => {
      const ratio = ((value / baseline_3m - 1) * 100).toFixed(0);
      return `Charges en flambée : +${ratio}% vs moyenne 3 mois`;
    },
  },

  // ── Retention drop : C2 actual < baseline - 5pp ──────────
  {
    kind: "composite",
    blockId: "kpi_retention_c2",
    fields: ["value", "baseline"],
    predicate: ({ value, baseline }) =>
      value < baseline - RETENTION_DROP_THRESHOLD_PP,
    signal: "retention_drop",
    severity: "critical",
    build: ({ value, baseline }) => {
      const dropPp = ((baseline - value) * 100).toFixed(1);
      return `Rétention C2 en baisse : -${dropPp}pp vs baseline`;
    },
  },

  // ── Feature adoption low : top_feature_usage < 20% MAU ───
  {
    kind: "composite",
    blockId: "kpi_top_feature",
    fields: ["value", "mau"],
    predicate: ({ value, mau }) => mau > 0 && value / mau < FEATURE_ADOPTION_LOW_RATIO,
    signal: "feature_adoption_low",
    severity: "warning",
    build: ({ value, mau }) => {
      const ratio = ((value / mau) * 100).toFixed(1);
      return `Adoption top feature faible : ${ratio}% du MAU (<20%)`;
    },
  },

  // ── NPS decline : current < previous - 10 ────────────────
  {
    kind: "composite",
    blockId: "kpi_nps",
    fields: ["value", "previous"],
    predicate: ({ value, previous }) => value < previous - NPS_DECLINE_THRESHOLD,
    signal: "nps_decline",
    severity: "warning",
    build: ({ value, previous }) => {
      const drop = (previous - value).toFixed(1);
      return `NPS en chute : -${drop} pts vs période précédente`;
    },
  },

  // ── CSAT drop : 7j < 30j baseline - 5pp ──────────────────
  {
    kind: "composite",
    blockId: "kpi_csat_7d",
    fields: ["value", "baseline"],
    predicate: ({ value, baseline }) => value < baseline - CSAT_DROP_THRESHOLD_PP,
    signal: "csat_drop",
    severity: "warning",
    build: ({ value, baseline }) => {
      const dropPp = ((baseline - value) * 100).toFixed(1);
      return `CSAT 7j en baisse : -${dropPp}pp vs baseline 30j`;
    },
  },

  // ── SLA breach : compliance_rate < 90% ───────────────────
  {
    kind: "simple",
    blockId: "kpi_sla",
    field: "value",
    predicate: (n) => n < SLA_BREACH_COMPLIANCE_THRESHOLD,
    signal: "sla_breach",
    severity: "critical",
    build: (n) =>
      `SLA respecté à seulement ${(n * 100).toFixed(1)}% (<90%)`,
  },

  // ── Lead time drift : lead_time > baseline * 1.3 ─────────
  {
    kind: "composite",
    blockId: "kpi_lead_time",
    fields: ["value", "baseline"],
    predicate: ({ value, baseline }) =>
      baseline > 0 && value > baseline * LEAD_TIME_DRIFT_MULTIPLIER,
    signal: "lead_time_drift",
    severity: "warning",
    build: ({ value, baseline }) => {
      const ratio = ((value / baseline - 1) * 100).toFixed(0);
      return `Lead time s'allonge : +${ratio}% vs baseline (${value.toFixed(1)}h vs ${baseline.toFixed(1)}h)`;
    },
  },

  // ── Change failure rate critique : > 15% ─────────────────
  {
    kind: "simple",
    blockId: "kpi_change_failure_rate",
    field: "value",
    predicate: (n) => n > CHANGE_FAILURE_THRESHOLD,
    signal: "change_failure_high",
    severity: "critical",
    build: (n) =>
      `Change Failure Rate critique : ${(n * 100).toFixed(1)}% (>15%)`,
  },

  // ── Burnout risk (composite OR) :
  //    late_hours/MAU > 30%  OU  weekend_activity/MAU > 20%
  {
    kind: "composite",
    blockId: "kpi_late_hours",
    fields: ["value", "mau"],
    predicate: ({ value, mau }) => mau > 0 && value / mau > BURNOUT_HOURS_RATIO,
    signal: "burnout_risk",
    severity: "warning",
    build: ({ value, mau }) => {
      const ratio = ((value / mau) * 100).toFixed(1);
      return `Risque burnout : ${ratio}% de l'équipe en heures tardives (>30%)`;
    },
  },
  {
    kind: "composite",
    blockId: "kpi_weekend_activity",
    fields: ["value", "mau"],
    predicate: ({ value, mau }) =>
      mau > 0 && value / mau > BURNOUT_WEEKEND_RATIO,
    signal: "burnout_risk",
    severity: "warning",
    build: ({ value, mau }) => {
      const ratio = ((value / mau) * 100).toFixed(1);
      return `Risque burnout : ${ratio}% de l'équipe active en week-end (>20%)`;
    },
  },

  // ── Burnout risk via late_activity_ratio (HR/People) ─────
  // value = late_hours_ratio (heures soir 20h-6h ou weekend / total heures).
  // Pas de MAU requis : ratio direct précalculé côté catalogue.
  {
    kind: "simple",
    blockId: "kpi_late_activity",
    field: "value",
    predicate: (n) => n > BURNOUT_LATE_ACTIVITY_RATIO,
    signal: "burnout_risk",
    severity: "warning",
    build: (n) =>
      `Risque burnout : ${(n * 100).toFixed(1)}% des messages hors heures ouvrées (>25%)`,
  },

  // ── Incident spike : value > baseline_4w * 1.5 ───────────
  {
    kind: "composite",
    blockId: "kpi_incidents",
    fields: ["value", "baseline_4w"],
    predicate: ({ value, baseline_4w }) =>
      baseline_4w > 0 && value > baseline_4w * INCIDENT_SPIKE_BASELINE_MULTIPLIER,
    signal: "incident_spike",
    severity: "critical",
    build: ({ value, baseline_4w }) => {
      const ratio = ((value / baseline_4w - 1) * 100).toFixed(0);
      return `Pic d'incidents : ${value.toFixed(0)} vs baseline 4w ${baseline_4w.toFixed(1)} (+${ratio}%)`;
    },
  },
];

/**
 * Applique toutes les règles au payload et retourne les signaux émis +
 * la severity globale (la plus haute des signaux).
 */
export function extractSignals(payload: RenderPayload): ExtractedSignals {
  const signals: BusinessSignal[] = [];
  const seen = new Set<BusinessSignalType>();

  for (const rule of RULES) {
    // Dédup : un même type de signal n'est émis qu'une fois par run.
    if (seen.has(rule.signal)) continue;

    if (rule.kind === "simple") {
      const key = `${rule.blockId}.${rule.field}`;
      const n = readNumber(payload.scalars, key);
      if (n === null) continue;
      if (!rule.predicate(n)) continue;

      seen.add(rule.signal);
      signals.push({
        type: rule.signal,
        severity: rule.severity,
        message: rule.build(n),
        blockId: rule.blockId,
      });
      continue;
    }

    // Composite : tous les fields doivent être lisibles.
    const values: Record<string, number> = {};
    let allReadable = true;
    for (const field of rule.fields) {
      const n = readNumber(payload.scalars, `${rule.blockId}.${field}`);
      if (n === null) {
        allReadable = false;
        break;
      }
      values[field] = n;
    }
    if (!allReadable) continue;
    if (!rule.predicate(values)) continue;

    seen.add(rule.signal);
    signals.push({
      type: rule.signal,
      severity: rule.severity,
      message: rule.build(values),
      blockId: rule.blockId,
    });
  }

  const severity = determineSeverity(signals.map((s) => s.type));
  return { signals, severity };
}
