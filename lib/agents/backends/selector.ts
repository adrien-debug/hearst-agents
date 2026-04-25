/**
 * Agent Backends — Unified Selector
 *
 * Re-exports both v1 and v2 selectors.
 * - selectAgentBackend: v1 simple heuristic
 * - selectBackend: v2 multi-criteria scoring
 */

export { selectAgentBackend } from "../backend/selector";

export {
  analyzeTask,
  scoreBackends,
  selectBackend,
  planHybridExecution,
  isBackendAvailable,
  listAvailableBackends,
  recommendFor,
  testSelector,
  testHybridPlanning,
  type SelectorConfig,
} from "../backend-v2/selector";
