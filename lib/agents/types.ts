/**
 * Custom Agent Framework — Types.
 *
 * Agents are first-class named entities that the orchestrator can route to.
 * Each agent declares its capabilities, allowed tools, and default context.
 *
 * Distinct from the DB-backed `agents` table (admin CRUD).
 * These are runtime agent definitions used by the v2 orchestrator.
 */

import type { ToolCapability } from "../tools/types";

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  capabilities: ToolCapability[];
  allowedTools: string[];
  defaultContext: string;
}
