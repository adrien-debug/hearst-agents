/**
 * Agent Backends — Hearst Runtime backend selector (v1 compat shim)
 *
 * Wraps the v2 selector to expose the legacy AgentBackendDecision interface.
 */

import { selectBackend } from "../backend-v2/selector";
import type { AgentBackend, AgentBackendDecision } from "./types";

interface LegacySelectorInput {
  agent?: unknown;
  context?: unknown;
  userInput?: string;
  complexity?: number | string;
  needsAutonomy?: boolean;
}

export function selectAgentBackend(input: LegacySelectorInput): AgentBackendDecision {
  const result = selectBackend(
    { prompt: input.userInput ?? "" },
    {},
    [],
  );

  const backendMap: Record<string, AgentBackend> = {
    anthropic_managed: "anthropic_managed",
    hearst_runtime: "hearst_runtime",
  };

  const backend: AgentBackend = backendMap[result.selectedBackend] ?? "hearst_runtime";

  return {
    backend,
    reason: result.reasoning[0] ?? "auto-selected",
  };
}
