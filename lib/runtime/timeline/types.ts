/**
 * Unified Execution Timeline — canonical types.
 *
 * One model to represent what happened during a run:
 * user request → mode → agent → steps → assets → completion.
 */

export type TimelineItemType =
  | "run_started"
  | "execution_mode"
  | "agent_selected"
  | "provider_check"
  | "capability_blocked"
  | "step_started"
  | "step_completed"
  | "step_failed"
  | "asset_generated"
  | "log"
  | "run_completed"
  | "run_failed";

export type TimelineSeverity = "info" | "success" | "warning" | "error";

export interface TimelineItem {
  id: string;
  type: TimelineItemType;
  ts: number;

  title: string;
  description?: string;

  runId?: string;
  agentId?: string;
  backend?: string;
  provider?: string;
  assetId?: string;
  assetName?: string;

  severity: TimelineSeverity;
}
