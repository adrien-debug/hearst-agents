/**
 * Core Types — Agents
 *
 * Canonical re-exports for agent-related types. The Backend V2 / Sessions
 * types were removed alongside the legacy OpenAI backends — every run path
 * now goes through the planner + executor, with Composio handling per-user
 * action dispatch.
 */

export type { AgentDefinition } from "@/lib/agents/types";

export type { CapabilityAgent } from "@/lib/engine/runtime/delegate/types";
export type { StepActor } from "@/lib/engine/runtime/engine/types";
