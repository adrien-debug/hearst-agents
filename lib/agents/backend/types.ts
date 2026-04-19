/**
 * Agent Backend — Types.
 *
 * Defines the backend options for agent execution.
 * hearst_runtime: controlled, step-by-step execution via RunEngine.
 * anthropic_managed: delegated to Claude's managed agent infrastructure.
 */

export type AgentBackend = "hearst_runtime" | "anthropic_managed";

export interface AgentBackendDecision {
  backend: AgentBackend;
  reason: string;
}
