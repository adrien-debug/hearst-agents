/**
 * Feedback Loop — types pour les signaux d'amélioration.
 *
 * Les signaux sont persistés via signal-manager et consultables
 * via /api/signals. Pas d'auto-apply — toutes les actions sont
 * initiées par l'opérateur.
 */

export type FeedbackKind =
  | "agent_config"
  | "prompt_tuning"
  | "guard_policy"
  | "tool_replacement"
  | "cost_optimization"
  | "reliability_alert";

export type FeedbackPriority = "low" | "medium" | "high" | "critical";

export interface FeedbackSignal {
  kind: FeedbackKind;
  priority: FeedbackPriority;
  target_id: string;
  target_type: "agent" | "tool" | "integration" | "global";
  title: string;
  description: string;
  suggestion: string;
  data: Record<string, unknown>;
}
