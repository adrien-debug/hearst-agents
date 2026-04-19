/**
 * Agent Backend Selector — Decides which backend runs a custom agent.
 *
 * v1 heuristic: research-heavy + autonomous + complex → anthropic_managed.
 * Everything else → hearst_runtime.
 */

import type { AgentDefinition } from "../types";
import type { AgentBackendDecision } from "./types";

export function selectAgentBackend(input: {
  agent: AgentDefinition;
  context: string;
  userInput: string;
  complexity: number;
  needsAutonomy: boolean;
}): AgentBackendDecision {
  const lower = input.userInput.toLowerCase();

  const isResearchHeavy =
    input.context === "research" ||
    lower.includes("report") ||
    lower.includes("benchmark") ||
    lower.includes("actualité") ||
    lower.includes("crypto") ||
    lower.includes("market") ||
    lower.includes("news");

  if (isResearchHeavy && input.needsAutonomy && input.complexity >= 6) {
    return {
      backend: "anthropic_managed",
      reason: "Open-ended research task requiring autonomy",
    };
  }

  return {
    backend: "hearst_runtime",
    reason: "Default backend for controlled execution",
  };
}
