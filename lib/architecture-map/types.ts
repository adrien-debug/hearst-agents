/**
 * Architecture Map — types.
 *
 * Typed shape of docs/architecture-map.json.
 * The architecture map is the canonical source of truth for the system graph.
 */

export type NodeStatus = "active" | "beta" | "planned" | "deprecated";
export type NodeCategory = "ui_surface" | "agent" | "runtime" | "persistence" | "connector";
export type EdgeType = "connects_to" | "flow_step";

// ── Source-of-truth shapes ───────────────────────────────

export interface UISurfaceEntry {
  id: string;
  label: string;
  role: string;
  status: NodeStatus;
  critical?: boolean;
  connects_to: string[];
}

export interface AgentEntry {
  id: string;
  label: string;
  role: string;
  group: string;
  context: string;
  backends: string[];
  tools: string[];
  status: NodeStatus;
  connects_to: string[];
}

export interface RuntimeEntry {
  id: string;
  label: string;
  role: string;
  status: NodeStatus;
  critical?: boolean;
  connects_to: string[];
}

export interface PersistenceEntry {
  id: string;
  label: string;
  role: string;
  status: NodeStatus;
  critical?: boolean;
  connects_to: string[];
}

export interface ConnectorEntry {
  id: string;
  label: string;
  role: string;
  status: NodeStatus;
  connects_to: string[];
}

export interface FlowEntry {
  id: string;
  label: string;
  description: string;
  steps: string[];
}

export interface ArchitectureMap {
  meta: {
    title: string;
    version: string;
    updated: string;
    description: string;
  };
  ui_surfaces: UISurfaceEntry[];
  agents: AgentEntry[];
  runtime_components: RuntimeEntry[];
  persistence: PersistenceEntry[];
  connectors: ConnectorEntry[];
  flows: FlowEntry[];
}

// ── Normalized graph shapes ──────────────────────────────

export interface ArchNode {
  id: string;
  label: string;
  role: string;
  category: NodeCategory;
  status: NodeStatus;
  critical: boolean;
  metadata: Record<string, unknown>;
}

export interface ArchEdge {
  from: string;
  to: string;
  type: EdgeType;
}
