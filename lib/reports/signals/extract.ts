/**
 * Extracteur déterministe de business signals depuis un RenderPayload.
 *
 * Le LLM ne participe PAS à la décision — c'est purement règles. Garantie :
 * pour un payload donné, on émet toujours la même liste de signaux.
 *
 * Convention de scalars (sortie de renderBlocks) :
 *   "{blockId}.value" : la valeur principale
 *   "{blockId}.delta" : variation (en fraction, ex. 0.12 = +12%)
 *   "{blockId}.count" : nombre de rows
 *
 * Les règles inspectent les block ids canoniques utilisés dans le catalogue
 * (kpi_mrr, kpi_runway, kpi_pipeline, kpi_inbox, kpi_commits, kpi_tickets).
 */

import type { RenderPayload } from "@/lib/reports/engine/render-blocks";
import type {
  BusinessSignalType,
  Severity,
} from "@/lib/engine/runtime/report-runner";
import { determineSeverity } from "@/lib/engine/runtime/report-runner";

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

/**
 * Lit un scalar typé number ; retourne null si absent ou non finite.
 */
function readNumber(scalars: Record<string, unknown>, key: string): number | null {
  const v = scalars[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

interface Rule {
  blockId: string;
  /** Regarde scalar "{blockId}.{field}" — défaut "delta". */
  field?: "value" | "delta" | "count";
  predicate: (n: number) => boolean;
  signal: BusinessSignalType;
  severity: Severity;
  build: (n: number) => string;
}

/**
 * Règles triées par priorité — premier match gagne pour le même blockId.
 * Note : on émet TOUS les signaux qui matchent (un report peut déclencher
 * plusieurs alertes). Les rules contradictoires (ex. mrr_drop ET mrr_spike)
 * sont mutuellement exclusives par construction (predicates opposés).
 */
const RULES: Rule[] = [
  // MRR
  {
    blockId: "kpi_mrr",
    field: "delta",
    predicate: (n) => n <= -0.15,
    signal: "mrr_drop",
    severity: "critical",
    build: (n) => `MRR en chute de ${(n * 100).toFixed(1)}% vs période précédente`,
  },
  {
    blockId: "kpi_mrr",
    field: "delta",
    predicate: (n) => n < -0.05 && n > -0.15,
    signal: "mrr_drop",
    severity: "warning",
    build: (n) => `MRR en baisse de ${(n * 100).toFixed(1)}% vs période précédente`,
  },
  {
    blockId: "kpi_mrr",
    field: "delta",
    predicate: (n) => n >= 0.10,
    signal: "mrr_spike",
    severity: "info",
    build: (n) => `MRR en hausse de +${(n * 100).toFixed(1)}% vs période précédente`,
  },

  // Runway (mois)
  {
    blockId: "kpi_runway",
    field: "value",
    predicate: (n) => n < 6,
    signal: "runway_risk",
    severity: "critical",
    build: (n) => `Runway critique : ${n.toFixed(1)} mois restants`,
  },
  {
    blockId: "kpi_runway",
    field: "value",
    predicate: (n) => n >= 6 && n < 9,
    signal: "runway_risk",
    severity: "warning",
    build: (n) => `Runway tendu : ${n.toFixed(1)} mois restants`,
  },

  // Pipeline value (en multiple du quota mensuel — convention 3x)
  // V1 : on alerte si pipeline_value est trop bas en absolu (<50k EUR par défaut)
  {
    blockId: "kpi_pipeline",
    field: "value",
    predicate: (n) => n < 50_000,
    signal: "pipeline_thin",
    severity: "warning",
    build: (n) => `Pipeline ouvert faible : ${n.toLocaleString("fr-FR")}`,
  },

  // Inbox backlog
  {
    blockId: "kpi_inbox",
    field: "value",
    predicate: (n) => n >= 50,
    signal: "support_overload",
    severity: "warning",
    build: (n) => `${n} emails en attente — backlog`,
  },

  // Tickets ouverts (Customer 360)
  {
    blockId: "kpi_tickets",
    field: "value",
    predicate: (n) => n >= 5,
    signal: "customer_at_risk",
    severity: "warning",
    build: (n) => `${n} tickets ouverts pour ce client`,
  },

  // Commits velocity drop
  {
    blockId: "kpi_commits",
    field: "delta",
    predicate: (n) => n <= -0.30,
    signal: "commit_velocity_drop",
    severity: "warning",
    build: (n) => `Vélocité commits en baisse de ${(n * 100).toFixed(0)}%`,
  },

  // Cycle time drift (Deal-to-Cash)
  {
    blockId: "kpi_cycle",
    field: "delta",
    predicate: (n) => n >= 0.20,
    signal: "cycle_time_drift",
    severity: "warning",
    build: (n) => `Cycle time s'allonge de +${(n * 100).toFixed(0)}%`,
  },

  // Calendar overload
  {
    blockId: "kpi_meetings",
    field: "value",
    predicate: (n) => n >= 25,
    signal: "calendar_overload",
    severity: "warning",
    build: (n) => `${n} réunions cette semaine — agenda saturé`,
  },
];

/**
 * Applique toutes les règles au payload et retourne les signaux émis +
 * la severity globale (la plus haute des signaux).
 */
export function extractSignals(payload: RenderPayload): ExtractedSignals {
  const signals: BusinessSignal[] = [];
  const seen = new Set<string>();

  for (const rule of RULES) {
    const field = rule.field ?? "delta";
    const key = `${rule.blockId}.${field}`;
    const n = readNumber(payload.scalars, key);
    if (n === null) continue;
    if (!rule.predicate(n)) continue;

    // Dédup : un même type de signal n'est émis qu'une fois par run.
    if (seen.has(rule.signal)) continue;
    seen.add(rule.signal);

    signals.push({
      type: rule.signal,
      severity: rule.severity,
      message: rule.build(n),
      blockId: rule.blockId,
    });
  }

  const severity = determineSeverity(signals.map((s) => s.type));
  return { signals, severity };
}
