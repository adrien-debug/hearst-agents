/**
 * Types et helpers de signal pour le pipeline reports V2.
 *
 * Auparavant cohabitaient avec les signaux crypto V1 dans
 * `lib/engine/runtime/report-runner.ts` ; ce fichier ne contient plus que la
 * partie business utilisée par le catalogue (Founder Cockpit, Customer 360,
 * Deal-to-Cash) et l'extracteur déterministe `extractSignals`.
 */

export const BUSINESS_SIGNAL_TYPES = [
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
] as const;

export type BusinessSignalType = (typeof BUSINESS_SIGNAL_TYPES)[number];

export type Severity = "info" | "warning" | "critical";

/**
 * Sévérité globale d'un report = max sur la liste de signaux émis.
 * Les signaux critiques (mrr_drop, runway_risk) escaladent en `critical`,
 * les flux sous tension en `warning`, le reste en `info`.
 */
export function determineSeverity(signals: BusinessSignalType[]): Severity {
  if (signals.includes("mrr_drop") || signals.includes("runway_risk")) return "critical";
  if (
    signals.includes("pipeline_thin") ||
    signals.includes("cycle_time_drift") ||
    signals.includes("customer_at_risk") ||
    signals.includes("support_overload")
  ) {
    return "warning";
  }
  if (signals.length > 0) return "info";
  return "info";
}
