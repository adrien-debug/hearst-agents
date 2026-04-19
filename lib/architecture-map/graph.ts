/**
 * Architecture Map — graph transform.
 *
 * Normalizes the source-of-truth JSON into a flat graph of nodes + edges.
 * Supports reverse dependency lookups for impact analysis.
 */

import type { ArchitectureMap, ArchNode, ArchEdge, FlowEntry, NodeCategory } from "./types";
import { loadArchitectureMap } from "./load";

interface BaseEntry {
  id: string;
  label: string;
  role: string;
  status: string;
  critical?: boolean;
  connects_to: string[];
}

function toNodes<T extends BaseEntry>(
  entries: T[],
  category: NodeCategory,
): ArchNode[] {
  return entries.map((e) => {
    const rest: Record<string, unknown> = {};
    const skip = new Set(["id", "label", "role", "status", "critical", "connects_to"]);
    for (const [k, v] of Object.entries(e)) {
      if (!skip.has(k)) rest[k] = v;
    }
    return {
      id: e.id,
      label: e.label,
      role: e.role,
      category,
      status: e.status as ArchNode["status"],
      critical: e.critical ?? false,
      metadata: rest,
    };
  });
}

function toEdges(
  entries: Array<{ id: string; connects_to: string[] }>,
): ArchEdge[] {
  const edges: ArchEdge[] = [];
  for (const entry of entries) {
    for (const target of entry.connects_to) {
      edges.push({ from: entry.id, to: target, type: "connects_to" });
    }
  }
  return edges;
}

function flowEdges(flows: FlowEntry[]): ArchEdge[] {
  const edges: ArchEdge[] = [];
  for (const flow of flows) {
    for (let i = 0; i < flow.steps.length - 1; i++) {
      edges.push({ from: flow.steps[i], to: flow.steps[i + 1], type: "flow_step" });
    }
  }
  return edges;
}

export function getArchitectureGraph(map?: ArchitectureMap) {
  const data = map ?? loadArchitectureMap();

  const nodes: ArchNode[] = [
    ...toNodes(data.ui_surfaces, "ui_surface"),
    ...toNodes(data.agents, "agent"),
    ...toNodes(data.runtime_components, "runtime"),
    ...toNodes(data.persistence, "persistence"),
    ...toNodes(data.connectors, "connector"),
  ];

  const edges: ArchEdge[] = [
    ...toEdges(data.ui_surfaces),
    ...toEdges(data.agents),
    ...toEdges(data.runtime_components),
    ...toEdges(data.persistence),
    ...toEdges(data.connectors),
    ...flowEdges(data.flows),
  ];

  return { nodes, edges };
}

export function getArchitectureNodes(map?: ArchitectureMap): ArchNode[] {
  return getArchitectureGraph(map).nodes;
}

export function getArchitectureEdges(map?: ArchitectureMap): ArchEdge[] {
  return getArchitectureGraph(map).edges;
}

export function getFlowById(flowId: string, map?: ArchitectureMap): FlowEntry | undefined {
  const data = map ?? loadArchitectureMap();
  return data.flows.find((f) => f.id === flowId);
}

export function getReverseDependencies(nodeId: string, map?: ArchitectureMap): string[] {
  const edges = getArchitectureEdges(map);
  return [...new Set(edges.filter((e) => e.to === nodeId).map((e) => e.from))];
}

export function getDownstreamDependencies(nodeId: string, map?: ArchitectureMap): string[] {
  const edges = getArchitectureEdges(map);
  return [...new Set(edges.filter((e) => e.from === nodeId).map((e) => e.to))];
}
