/**
 * Workflow validation — assure qu'un graphe peut s'exécuter.
 *
 * Règles :
 * 1. startNodeId doit exister dans `nodes`
 * 2. Toute edge doit pointer vers des nodes connus
 * 3. Aucun cycle accessible depuis startNodeId
 * 4. Configs minimums respectées par kind (tool_call → tool, condition → expression, …)
 * 5. Au moins un node terminal joignable (sans edges sortants OU output)
 */

import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowValidationError,
  WorkflowValidationResult,
} from "./types";

const REQUIRED_CONFIG_BY_KIND: Record<string, string[]> = {
  trigger: [], // mode: manual|cron|webhook (optionnel à la validation)
  tool_call: ["tool"],
  condition: ["expression"],
  approval: [],
  output: [],
  transform: ["expression"],
};

export function validateGraph(graph: WorkflowGraph): WorkflowValidationResult {
  const errors: WorkflowValidationError[] = [];

  if (!graph.startNodeId) {
    errors.push({ code: "missing_start", message: "startNodeId requis" });
    return { valid: false, errors };
  }

  const nodeMap = new Map<string, WorkflowNode>();
  for (const n of graph.nodes) nodeMap.set(n.id, n);

  if (!nodeMap.has(graph.startNodeId)) {
    errors.push({
      code: "start_not_found",
      message: `Node de départ « ${graph.startNodeId} » introuvable`,
    });
  }

  // Edge integrity
  for (const edge of graph.edges) {
    if (!nodeMap.has(edge.source)) {
      errors.push({
        edgeId: edge.id,
        code: "edge_source_missing",
        message: `Edge ${edge.id} : source « ${edge.source} » inexistante`,
      });
    }
    if (!nodeMap.has(edge.target)) {
      errors.push({
        edgeId: edge.id,
        code: "edge_target_missing",
        message: `Edge ${edge.id} : target « ${edge.target} » inexistante`,
      });
    }
  }

  // Per-node config check
  for (const node of graph.nodes) {
    const required = REQUIRED_CONFIG_BY_KIND[node.kind] ?? [];
    for (const key of required) {
      const v = node.config?.[key];
      if (v === undefined || v === null || v === "") {
        errors.push({
          nodeId: node.id,
          code: "node_config_invalid",
          message: `Node ${node.label || node.id} : champ « ${key} » manquant`,
        });
      }
    }
  }

  // Cycle detection — DFS depuis startNode
  if (nodeMap.has(graph.startNodeId)) {
    const adj = buildAdjacency(graph);
    const cycle = detectCycle(graph.startNodeId, adj);
    if (cycle) {
      errors.push({
        code: "cycle_detected",
        message: `Cycle détecté : ${cycle.join(" → ")}`,
      });
    }

    // No terminal — un graphe sans sortie n'aboutit jamais.
    const reachable = collectReachable(graph.startNodeId, adj);
    const hasTerminal = Array.from(reachable).some((id) => {
      const node = nodeMap.get(id);
      const outgoing = adj.get(id) ?? [];
      return node?.kind === "output" || outgoing.length === 0;
    });
    if (!hasTerminal && reachable.size > 0) {
      errors.push({
        code: "no_terminal",
        message: "Le workflow n'a aucun node terminal accessible",
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

function buildAdjacency(graph: WorkflowGraph): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const node of graph.nodes) adj.set(node.id, []);
  for (const edge of graph.edges) {
    const list = adj.get(edge.source);
    if (list) list.push(edge.target);
  }
  return adj;
}

function detectCycle(
  start: string,
  adj: Map<string, string[]>,
): string[] | null {
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  for (const id of adj.keys()) color.set(id, WHITE);

  function dfs(node: string): string[] | null {
    color.set(node, GRAY);
    for (const next of adj.get(node) ?? []) {
      const c = color.get(next);
      if (c === GRAY) {
        // Reconstruct cycle path
        const path: string[] = [next, node];
        let cur: string | null = node;
        while (cur && parent.get(cur) && parent.get(cur) !== next) {
          cur = parent.get(cur) ?? null;
          if (cur) path.push(cur);
        }
        return path.reverse();
      }
      if (c === WHITE) {
        parent.set(next, node);
        const found = dfs(next);
        if (found) return found;
      }
    }
    color.set(node, BLACK);
    return null;
  }

  return dfs(start);
}

function collectReachable(
  start: string,
  adj: Map<string, string[]>,
): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of adj.get(id) ?? []) {
      if (!seen.has(next)) stack.push(next);
    }
  }
  return seen;
}
