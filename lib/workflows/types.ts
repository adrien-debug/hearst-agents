/**
 * Workflow Builder — Types de graphe.
 *
 * Un WorkflowGraph est un DAG de nœuds typés (trigger, tool_call, condition,
 * approval, output, transform) reliés par des edges éventuellement gardés par
 * une condition. Persisté tel quel dans `missions.actions.workflowGraph`
 * (JSONB) — pas de schéma DB dédié.
 */

export type WorkflowNodeKind =
  | "trigger"
  | "tool_call"
  | "condition"
  | "approval"
  | "output"
  | "transform";

/**
 * Politique d'erreur pour un node :
 * - "abort"  → arrête le run au premier échec (default)
 * - "skip"   → marque le step en failed, suit l'edge "next" et continue
 * - "retry"  → tente jusqu'à 3 fois avant abort
 */
export type WorkflowOnError = "abort" | "skip" | "retry";

export interface WorkflowNode {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  /** Configuration spécifique au kind (ex: tool name, cron pattern, expression). */
  config: Record<string, unknown>;
  /** Position UI persistée pour conserver le layout côté Builder. */
  position?: { x: number; y: number };
  /** Politique d'erreur (default "abort"). */
  onError?: WorkflowOnError;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  /**
   * Pour les edges sortant d'un node "condition" : valeur attendue
   * du résultat de la condition ("true" | "false" | label libre).
   * Pour les edges normaux : undefined → toujours traversée.
   */
  condition?: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  startNodeId: string;
  /** Version du schéma — incrémentée à chaque save pour optimistic concurrency. */
  version?: number;
}

// ── Validation ──────────────────────────────────────────────

export interface WorkflowValidationError {
  nodeId?: string;
  edgeId?: string;
  code:
    | "missing_start"
    | "start_not_found"
    | "cycle_detected"
    | "edge_source_missing"
    | "edge_target_missing"
    | "node_config_invalid"
    | "no_terminal";
  message: string;
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: WorkflowValidationError[];
}

// ── Execution context ───────────────────────────────────────

/**
 * Contexte transmis à l'executor — fournit les helpers tools/approvals
 * et les outputs accumulés, indexés par node id, pour les passer aux
 * nodes suivants (transform, condition).
 */
export interface WorkflowExecutionContext {
  userId: string;
  tenantId: string;
  workspaceId: string;
  runId: string;
  /** Indique un run en mode preview (dry-run, pas d'effet de bord). */
  preview?: boolean;
  /** Outputs accumulés des nodes déjà exécutés. */
  outputs: Map<string, unknown>;
}

export interface WorkflowToolHandler {
  (tool: string, args: Record<string, unknown>): Promise<{
    success: boolean;
    output?: unknown;
    error?: string;
  }>;
}

export interface WorkflowExecutionCallbacks {
  /** Exécute un tool (Composio, send_message, etc.). */
  executeTool: WorkflowToolHandler;
  /** Émet un événement SSE compatible vague B1. */
  emitEvent: (event: WorkflowExecutorEvent) => void;
  /** Pause sur un node "approval" — l'orchestrator persistera l'attente. */
  onApprovalRequired?: (nodeId: string, preview: string) => void;
}

export type WorkflowExecutorEvent =
  | { type: "step_started"; nodeId: string; kind: WorkflowNodeKind; label: string }
  | { type: "step_completed"; nodeId: string; output?: unknown }
  | { type: "step_failed"; nodeId: string; error: string }
  | { type: "step_skipped"; nodeId: string; reason: string }
  | { type: "awaiting_approval"; nodeId: string; preview: string }
  | { type: "workflow_completed"; outputs: Array<{ nodeId: string; output: unknown }> }
  | { type: "workflow_failed"; error: string };

// ── Helpers ─────────────────────────────────────────────────

/** Crée un graphe vide minimal — un seul node trigger manuel. */
export function createEmptyGraph(): WorkflowGraph {
  const triggerId = `trigger_${Date.now()}`;
  return {
    nodes: [
      {
        id: triggerId,
        kind: "trigger",
        label: "Manual trigger",
        config: { mode: "manual" },
        position: { x: 80, y: 200 },
      },
    ],
    edges: [],
    startNodeId: triggerId,
    version: 1,
  };
}
