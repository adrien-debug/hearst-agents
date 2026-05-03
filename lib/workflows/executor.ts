/**
 * Workflow Executor — runner BFS d'un WorkflowGraph.
 *
 * Émet des événements compatibles avec les consumers SSE existants
 * (mappés par le caller sur step_started / step_completed / step_failed
 * vague B1) plus les events spécifiques au builder (workflow_completed).
 *
 * Notes :
 * - Cap nodes par run = 50 par défaut (override via opts.maxNodes).
 * - Les edges sortant d'un node "condition" peuvent porter une `condition`
 *   string ; si l'expression du node évalue à `true`, on traverse les
 *   edges marquées "true" (idem "false"). Sinon on suit les edges sans
 *   condition (default branch).
 * - L'evaluation des expressions est volontairement minimale (pas d'eval JS) :
 *   on supporte `output.X.Y`, opérateurs `==`, `!=`, `<`, `>`, `<=`, `>=`,
 *   et littéraux nombres/strings. Étendable à l'avenir.
 * - Approval : on émet `awaiting_approval` puis on s'arrête. Le run est
 *   relancé par le caller via `executeWorkflow` avec context.outputs déjà
 *   peuplé (resume manuel). NOTE produit : pour un resume transparent
 *   depuis `POST /api/v2/workflows/[runId]/approve-node` (route D5
 *   audit-only aujourd'hui), il faudrait persister
 *   `{ graph, outputs, awaitingNodeId }` en base. Décision pas prise —
 *   tant que les workflows à approval restent rares, le resume manuel
 *   côté caller suffit.
 */

import type {
  WorkflowExecutionCallbacks,
  WorkflowExecutionContext,
  WorkflowGraph,
  WorkflowNode,
} from "./types";
import { validateGraph } from "./validate";

export interface ExecuteWorkflowOptions {
  /** Cap de nodes traversés (default 50). */
  maxNodes?: number;
  /** Empêche les transitions condition d'aller vers une branch implicite. */
  strictConditions?: boolean;
}

export interface WorkflowExecutionResult {
  status: "completed" | "failed" | "awaiting_approval" | "invalid";
  outputs: Array<{ nodeId: string; output: unknown }>;
  error?: string;
  visitedCount: number;
  awaitingNodeId?: string;
}

export async function executeWorkflow(
  graph: WorkflowGraph,
  context: WorkflowExecutionContext,
  callbacks: WorkflowExecutionCallbacks,
  options: ExecuteWorkflowOptions = {},
): Promise<WorkflowExecutionResult> {
  const validation = validateGraph(graph);
  if (!validation.valid) {
    const message = validation.errors
      .map((e) => e.message)
      .join("; ");
    callbacks.emitEvent({ type: "workflow_failed", error: message });
    return {
      status: "invalid",
      outputs: [],
      error: message,
      visitedCount: 0,
    };
  }

  const maxNodes = options.maxNodes ?? 50;
  const nodeMap = new Map<string, WorkflowNode>();
  for (const n of graph.nodes) nodeMap.set(n.id, n);

  const adj = new Map<string, Array<{ target: string; condition?: string }>>();
  for (const node of graph.nodes) adj.set(node.id, []);
  for (const edge of graph.edges) {
    const list = adj.get(edge.source);
    if (list) list.push({ target: edge.target, condition: edge.condition });
  }

  const queue: string[] = [graph.startNodeId];
  const visited = new Set<string>();
  let visitedCount = 0;

  while (queue.length > 0 && visitedCount < maxNodes) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    visitedCount++;

    const node = nodeMap.get(nodeId);
    if (!node) continue;

    callbacks.emitEvent({
      type: "step_started",
      nodeId,
      kind: node.kind,
      label: node.label,
    });

    let stepOutput: unknown = undefined;
    let stepFailed = false;
    let stepError: string | undefined;
    let conditionResult: boolean | string | undefined;

    try {
      const exec = await executeNode(node, context, callbacks);
      stepOutput = exec.output;
      conditionResult = exec.conditionResult;

      if (exec.awaitingApproval) {
        callbacks.emitEvent({
          type: "awaiting_approval",
          nodeId,
          preview: exec.approvalPreview ?? node.label,
        });
        return {
          status: "awaiting_approval",
          outputs: contextOutputsArray(context),
          visitedCount,
          awaitingNodeId: nodeId,
        };
      }

      context.outputs.set(nodeId, stepOutput);
      callbacks.emitEvent({
        type: "step_completed",
        nodeId,
        output: stepOutput,
      });
    } catch (err) {
      stepFailed = true;
      stepError = err instanceof Error ? err.message : String(err);
      const policy = node.onError ?? "abort";

      if (policy === "skip") {
        callbacks.emitEvent({
          type: "step_skipped",
          nodeId,
          reason: stepError,
        });
      } else {
        callbacks.emitEvent({
          type: "step_failed",
          nodeId,
          error: stepError,
        });
        callbacks.emitEvent({
          type: "workflow_failed",
          error: `${node.label || nodeId}: ${stepError}`,
        });
        return {
          status: "failed",
          outputs: contextOutputsArray(context),
          error: stepError,
          visitedCount,
        };
      }
    }

    // Choix des edges sortants
    const outgoing = adj.get(nodeId) ?? [];
    const next = selectNextEdges({
      outgoing,
      node,
      conditionResult,
      stepFailed,
      strictConditions: options.strictConditions === true,
    });
    for (const edge of next) {
      if (!visited.has(edge.target)) queue.push(edge.target);
    }

    // suppress unused warnings for stepError when policy is skip
    void stepError;
  }

  callbacks.emitEvent({
    type: "workflow_completed",
    outputs: contextOutputsArray(context),
  });
  return {
    status: "completed",
    outputs: contextOutputsArray(context),
    visitedCount,
  };
}

function contextOutputsArray(
  ctx: WorkflowExecutionContext,
): Array<{ nodeId: string; output: unknown }> {
  return Array.from(ctx.outputs.entries()).map(([nodeId, output]) => ({
    nodeId,
    output,
  }));
}

interface NodeExecResult {
  output?: unknown;
  conditionResult?: boolean;
  awaitingApproval?: boolean;
  approvalPreview?: string;
}

async function executeNode(
  node: WorkflowNode,
  context: WorkflowExecutionContext,
  callbacks: WorkflowExecutionCallbacks,
): Promise<NodeExecResult> {
  switch (node.kind) {
    case "trigger":
      // Le trigger n'exécute rien — c'est l'entrée du graphe. On retourne
      // simplement les params éventuels passés au run (config.input).
      return { output: node.config.input ?? null };

    case "tool_call": {
      const tool = String(node.config.tool ?? "");
      const args = (node.config.args as Record<string, unknown>) ?? {};
      const resolvedArgs = resolveArgsFromOutputs(args, context);

      if (context.preview) {
        // En preview on n'exécute pas le tool, on retourne un placeholder.
        return {
          output: {
            preview: true,
            tool,
            args: resolvedArgs,
            note: "Preview run — pas d'effet de bord",
          },
        };
      }

      const result = await callbacks.executeTool(tool, resolvedArgs);
      if (!result.success) {
        throw new Error(result.error ?? `Tool ${tool} a échoué`);
      }
      return { output: result.output };
    }

    case "condition": {
      const expression = String(node.config.expression ?? "");
      const value = evaluateCondition(expression, context);
      return { output: { expression, result: value }, conditionResult: value };
    }

    case "transform": {
      const expression = String(node.config.expression ?? "");
      const value = evaluateValue(expression, context);
      return { output: value };
    }

    case "approval": {
      const preview = String(
        node.config.preview ?? node.label ?? "Validation requise",
      );
      if (context.preview) {
        // En preview, on saute l'approval (auto-approve).
        return { output: { approved: true, preview, autoApproved: true } };
      }
      callbacks.onApprovalRequired?.(node.id, preview);
      return { awaitingApproval: true, approvalPreview: preview };
    }

    case "output": {
      // Stocke le payload résolu en sortie. Le caller persistera l'asset.
      const payload = resolveArgsFromOutputs(
        (node.config.payload as Record<string, unknown>) ?? {},
        context,
      );
      return { output: { kind: "output", payload } };
    }

    default:
      throw new Error(`Kind inconnu : ${(node as WorkflowNode).kind}`);
  }
}

// ── Edge selection ──────────────────────────────────────────

function selectNextEdges({
  outgoing,
  node,
  conditionResult,
  stepFailed,
  strictConditions,
}: {
  outgoing: Array<{ target: string; condition?: string }>;
  node: WorkflowNode;
  conditionResult: boolean | string | undefined;
  stepFailed: boolean;
  strictConditions: boolean;
}): Array<{ target: string; condition?: string }> {
  if (outgoing.length === 0) return [];

  // Edges marquées "error" — empruntées si step a failed (skip policy).
  const errorEdges = outgoing.filter((e) => e.condition === "error");
  if (stepFailed) {
    return errorEdges;
  }

  if (node.kind === "condition" && conditionResult !== undefined) {
    const matchKey = conditionResult === true ? "true" : conditionResult === false ? "false" : String(conditionResult);
    const matched = outgoing.filter((e) => e.condition === matchKey);
    if (matched.length > 0) return matched;
    if (strictConditions) return [];
    // Default branch — edges sans condition.
    return outgoing.filter((e) => !e.condition);
  }

  // Pour les autres kinds, on ne suit que les edges non-erreur.
  return outgoing.filter((e) => e.condition !== "error");
}

// ── Argument & expression resolvers ─────────────────────────

/**
 * Résout les args en remplaçant les placeholders `${nodeId.path.to.value}`
 * par la valeur correspondante dans context.outputs. Les valeurs non-string
 * passent telles quelles.
 */
function resolveArgsFromOutputs(
  args: Record<string, unknown>,
  context: WorkflowExecutionContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = resolveValue(v, context);
  }
  return out;
}

function resolveValue(value: unknown, context: WorkflowExecutionContext): unknown {
  if (typeof value === "string") {
    const match = value.match(/^\$\{([^}]+)\}$/);
    if (match) {
      return readPath(match[1], context);
    }
    // Inline interpolation
    return value.replace(/\$\{([^}]+)\}/g, (_, path) => {
      const v = readPath(path, context);
      return v === undefined || v === null ? "" : String(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, context));
  if (value && typeof value === "object") {
    return resolveArgsFromOutputs(
      value as Record<string, unknown>,
      context,
    );
  }
  return value;
}

function readPath(path: string, context: WorkflowExecutionContext): unknown {
  const parts = path.trim().split(".");
  if (parts.length === 0) return undefined;
  const root = parts.shift()!;
  let current = context.outputs.get(root);
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ── Condition / value evaluator (sans eval) ─────────────────

const COMPARISON_RE = /^(.+?)\s*(==|!=|<=|>=|<|>)\s*(.+)$/;

export function evaluateCondition(
  expression: string,
  context: WorkflowExecutionContext,
): boolean {
  const trimmed = expression.trim();
  if (!trimmed) return false;

  const m = trimmed.match(COMPARISON_RE);
  if (!m) {
    // expression unique : truthy de la valeur
    const v = evaluateValue(trimmed, context);
    return Boolean(v);
  }

  const left = evaluateValue(m[1], context);
  const op = m[2];
  const right = evaluateValue(m[3], context);

  switch (op) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case "<":
      return Number(left) < Number(right);
    case ">":
      return Number(left) > Number(right);
    case "<=":
      return Number(left) <= Number(right);
    case ">=":
      return Number(left) >= Number(right);
  }
  return false;
}

export function evaluateValue(
  raw: string,
  context: WorkflowExecutionContext,
): unknown {
  const trimmed = raw.trim();

  // String literal
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  // Number literal
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  // Boolean literal
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;

  // Path lookup
  return readPath(trimmed, context);
}
