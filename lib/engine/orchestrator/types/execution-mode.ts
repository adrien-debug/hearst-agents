/**
 * Execution Mode — strict routing types for the orchestrator.
 *
 * The orchestrator acts as a pure router: it classifies intent,
 * builds an ExecutionContext, and selects the appropriate mode.
 */

export enum ExecutionMode {
  DIRECT_ANSWER = "direct_answer",
  TOOL_CALL = "tool_call",
  WORKFLOW = "workflow",
  CUSTOM_AGENT = "custom_agent",
  MANAGED_AGENT = "managed_agent",
}

export type ExecutionContext = {
  intent: string;
  complexity: number;
  providersNeeded: number;
  needsAutonomy: boolean;
  needsMemory: boolean;
};

export type ExecutionDecision = {
  mode: ExecutionMode;
  reason: string;
  backend?: "hearst_runtime" | "anthropic_managed";
  agentId?: string;
};
