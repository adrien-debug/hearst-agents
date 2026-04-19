/**
 * Agent Selector — Selects the best agent for a given context.
 *
 * v1: simple context-based lookup with general fallback.
 */

import type { AgentDefinition } from "./types";
import { getAgentsByContext, getAgentById } from "./registry";

export function selectAgentForContext(
  context: string,
): AgentDefinition | undefined {
  const contextAgents = getAgentsByContext(context);
  if (contextAgents.length > 0) return contextAgents[0];

  return getAgentById("general_agent");
}
