/**
 * Agents — Architecture Finale
 *
 * Barrel export for all agent modules.
 * Path: lib/agents/index.ts
 */

// Core
export { registerAgent, getAgentById, getAllAgents, getAgentsByContext } from "./registry";
export type { AgentDefinition } from "./types";

// Backends
export * as Backends from "./backend-v2";

// Sessions
export * as Sessions from "./sessions";

// Specialized
export * as Specialized from "./specialized";

// Operator
export * as Operator from "./operator";
