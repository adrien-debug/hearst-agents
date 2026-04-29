/**
 * Types et helpers de signal pour le pipeline reports V2.
 *
 * Auparavant cohabitaient avec les signaux crypto V1 dans
 * `lib/engine/runtime/report-runner.ts` ; ce fichier ne contient plus que la
 * partie business utilisée par le catalogue (Founder Cockpit, Customer 360,
 * Deal-to-Cash, Financial P&L, Product Analytics, Support Health) et
 * l'extracteur déterministe `extractSignals`.
 */

export const BUSINESS_SIGNAL_TYPES = [
  // Existants V1
  "mrr_drop",
  "mrr_spike",
  "pipeline_thin",
  "runway_risk",
  "cycle_time_drift",
  "customer_at_risk",
  "support_overload",
  "commit_velocity_drop",
  "calendar_overload",
  "auth_expiring",
  // V2 — ajoutés pour Financial P&L / Product Analytics / Support Health
  "expense_spike",
  "retention_drop",
  "feature_adoption_low",
  "nps_decline",
  "csat_drop",
  "sla_breach",
  // V2.1 — ajoutés pour Engineering Velocity / HR-People
  "lead_time_drift",
  "change_failure_high",
  "burnout_risk",
  // V2.2 — ajouté pour Engineering Velocity (incidents)
  "incident_spike",
  // V2.3 — ajouté pour HR-People (calendar overload en heures)
  "meeting_overload",
] as const;

export type BusinessSignalType = (typeof BUSINESS_SIGNAL_TYPES)[number];

export type Severity = "info" | "warning" | "critical";

/**
 * Sévérité globale d'un report = max sur la liste de signaux émis.
 * Critical : risques business directs (cash, churn imminent, SLA cassé)
 * Warning  : flux sous tension (pipeline, coûts, satisfaction)
 * Info     : variations positives ou neutres
 */
const CRITICAL_SIGNALS: ReadonlySet<BusinessSignalType> = new Set([
  "mrr_drop",
  "runway_risk",
  "expense_spike",
  "sla_breach",
  "retention_drop",
  "change_failure_high",
  "incident_spike",
]);

const WARNING_SIGNALS: ReadonlySet<BusinessSignalType> = new Set([
  "pipeline_thin",
  "cycle_time_drift",
  "customer_at_risk",
  "support_overload",
  "feature_adoption_low",
  "nps_decline",
  "csat_drop",
  "commit_velocity_drop",
  "calendar_overload",
  "auth_expiring",
  "lead_time_drift",
  "burnout_risk",
  "meeting_overload",
]);

export function determineSeverity(signals: BusinessSignalType[]): Severity {
  if (signals.some((s) => CRITICAL_SIGNALS.has(s))) return "critical";
  if (signals.some((s) => WARNING_SIGNALS.has(s))) return "warning";
  if (signals.length > 0) return "info";
  return "info";
}
