/**
 * Canvas topology — single source of truth for node positions + edges.
 *
 * Maps the runtime pipeline (lib/engine/orchestrator/index.ts) onto a
 * deterministic SVG layout. Coordinates are absolute within the canvas
 * viewBox (0 0 1100 600).
 *
 * Adding a stage? Add it here, then map the relevant SSE event types in
 * event-reducer.ts. Visual rules / colors come from store.ts (NodeState).
 */

export type NodeId =
  | "entry"
  | "router"
  | "safety"
  | "intent"
  | "preflight"
  | "userdata"
  | "tools"
  | "agent"
  | "research"
  | "pipeline"
  | "complete";

export type SatelliteId = "memory" | "cost" | "logs" | "sse";

export interface CanvasNode {
  id: NodeId;
  label: string;
  sublabel: string;
  x: number;
  y: number;
  toggleable?: boolean;
  flagKey?: string;
  fileHint: string;
}

export interface CanvasSatellite {
  id: SatelliteId;
  label: string;
  x: number;
  y: number;
}

export interface CanvasEdge {
  id: string;
  from: NodeId;
  to: NodeId;
  branch?: "research" | "retrieval" | "pipeline" | "agent";
}

export const VIEWBOX = { width: 1500, height: 600 } as const;

export const NODE_SIZE = { w: 168, h: 80 } as const;

// Y-axis canon: top branch / main row / bottom branch
const Y_TOP = 180;
const Y_MID = 320;
const Y_BOT = 460;

// 8 columns, 180px gap between most nodes (final gap tighter to anchor `complete`).
const X = [110, 300, 490, 680, 870, 1060, 1250, 1400] as const;

export const NODES: CanvasNode[] = [
  { id: "entry", label: "Entrée", sublabel: "HTTP", x: X[0], y: Y_MID, fileHint: "app/api/orchestrate/route.ts" },
  { id: "router", label: "Routeur", sublabel: "capability", x: X[1], y: Y_MID, fileHint: "lib/capabilities/router.ts" },
  {
    id: "safety",
    label: "Garde-fou",
    sublabel: "safety gate",
    x: X[2],
    y: Y_MID,
    toggleable: true,
    flagKey: "safety_gate_enabled",
    fileHint: "lib/engine/orchestrator/safety-gate.ts",
  },
  { id: "intent", label: "Intent", sublabel: "détection", x: X[3], y: Y_MID, fileHint: "lib/engine/orchestrator/index.ts" },
  { id: "preflight", label: "Préflight", sublabel: "providers", x: X[4], y: Y_TOP, fileHint: "lib/connectors/control-plane/preflight.ts" },
  { id: "userdata", label: "Données user", sublabel: "context", x: X[4], y: Y_BOT, fileHint: "lib/connectors/data-retriever.ts" },
  { id: "tools", label: "Surface outils", sublabel: "tool layer", x: X[5], y: Y_MID, fileHint: "lib/tools/tool-selector.ts" },
  { id: "agent", label: "Agent custom", sublabel: "select", x: X[6], y: Y_TOP, fileHint: "lib/agents/agent-selector.ts" },
  { id: "research", label: "Research", sublabel: "deterministic", x: X[6], y: Y_MID, fileHint: "lib/engine/orchestrator/run-research-report.ts" },
  { id: "pipeline", label: "AI pipeline", sublabel: "streamText", x: X[6], y: Y_BOT, fileHint: "lib/engine/orchestrator/ai-pipeline.ts" },
  { id: "complete", label: "Run terminé", sublabel: "complete | failed", x: X[7], y: Y_MID, fileHint: "lib/engine/runtime/engine" },
];

// Satellites removed in V1 — they were decorative noise. If we re-introduce
// them, expose interactive metrics (token count, retry stats) rather than
// static dots.
export const SATELLITES: CanvasSatellite[] = [];

export const EDGES: CanvasEdge[] = [
  { id: "entry-router", from: "entry", to: "router" },
  { id: "router-safety", from: "router", to: "safety" },
  { id: "safety-intent", from: "safety", to: "intent" },
  { id: "intent-preflight", from: "intent", to: "preflight" },
  { id: "intent-userdata", from: "intent", to: "userdata" },
  { id: "preflight-tools", from: "preflight", to: "tools" },
  { id: "userdata-tools", from: "userdata", to: "tools" },
  { id: "tools-agent", from: "tools", to: "agent", branch: "agent" },
  { id: "tools-research", from: "tools", to: "research", branch: "research" },
  { id: "tools-pipeline", from: "tools", to: "pipeline", branch: "pipeline" },
  { id: "agent-complete", from: "agent", to: "complete" },
  { id: "research-complete", from: "research", to: "complete" },
  { id: "pipeline-complete", from: "pipeline", to: "complete" },
];

const NODE_BY_ID = new Map<NodeId, CanvasNode>(NODES.map((n) => [n.id, n]));

export function getNode(id: NodeId): CanvasNode {
  const node = NODE_BY_ID.get(id);
  if (!node) throw new Error(`Unknown node: ${id}`);
  return node;
}

/** Right-edge port (out) and left-edge port (in) of a node center. */
export function ports(node: CanvasNode) {
  return {
    out: { x: node.x + NODE_SIZE.w / 2, y: node.y },
    in: { x: node.x - NODE_SIZE.w / 2, y: node.y },
  };
}

/** Cubic Bézier path string between two points, horizontal control handles. */
export function bezierPath(
  a: { x: number; y: number },
  b: { x: number; y: number },
): string {
  const dx = Math.max(40, (b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}
