/**
 * Pure event → canvas-state diff.
 *
 * Decoupled from React + zustand so it can be unit-tested and reused for
 * both live SSE and replay. Returns a list of side-effect-free operations
 * that the caller applies to the store.
 */

import type { NodeId } from "./topology";
import type { NodeState } from "./store";

export type CanvasOp =
  | { kind: "node"; id: NodeId; state: NodeState }
  | { kind: "packet"; edgeId: string }
  | { kind: "reset" };

interface MinEvent {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

/**
 * Map a single event to canvas operations.
 *
 * Mapping rules:
 *  - `run_started` → entry active
 *  - `execution_mode_selected` → router success, intent active
 *  - `capability_blocked` → safety blocked (best heuristic — capability gate
 *    refusals always pre-empt the rest of the pipeline)
 *  - `app_connect_required` → preflight blocked
 *  - `tool_surface` → tools active
 *  - `agent_selected` → agent success
 *  - `tool_call_started` → pipeline active + packet from tools to pipeline
 *  - `tool_call_completed` → pipeline success
 *  - `step_started` (research) → research active
 *  - `asset_generated` → research success
 *  - `text_delta` → pipeline active (no packet — too noisy)
 *  - `orchestrator_log` containing "Safety gate refuse" / "Safety gate clarify"
 *    → safety failed / blocked
 *  - `run_completed` → complete success
 *  - `run_failed` → complete failed
 */
export function reduceEvent(event: MinEvent): CanvasOp[] {
  switch (event.type) {
    case "run_started":
      return [
        { kind: "reset" },
        { kind: "node", id: "entry", state: "active" },
      ];

    case "execution_mode_selected":
      return [
        { kind: "node", id: "entry", state: "success" },
        { kind: "node", id: "router", state: "success" },
        { kind: "node", id: "intent", state: "active" },
      ];

    case "capability_blocked":
      return [
        { kind: "node", id: "intent", state: "success" },
        { kind: "node", id: "safety", state: "blocked" },
      ];

    case "app_connect_required":
      return [
        { kind: "node", id: "intent", state: "success" },
        { kind: "node", id: "preflight", state: "blocked" },
      ];

    case "tool_surface":
      return [
        { kind: "node", id: "intent", state: "success" },
        { kind: "node", id: "preflight", state: "success" },
        { kind: "node", id: "tools", state: "active" },
      ];

    case "agent_selected":
      return [
        { kind: "node", id: "tools", state: "success" },
        { kind: "node", id: "agent", state: "success" },
      ];

    case "tool_call_started":
      return [
        { kind: "node", id: "tools", state: "success" },
        { kind: "node", id: "pipeline", state: "active" },
        { kind: "packet", edgeId: "tools-pipeline" },
      ];

    case "tool_call_completed":
      return [
        { kind: "node", id: "pipeline", state: "success" },
      ];

    case "step_started": {
      const agent = (event.agent ?? "").toString().toLowerCase();
      if (agent.includes("research")) {
        return [
          { kind: "node", id: "tools", state: "success" },
          { kind: "node", id: "research", state: "active" },
          { kind: "packet", edgeId: "tools-research" },
        ];
      }
      return [{ kind: "node", id: "pipeline", state: "active" }];
    }

    case "asset_generated":
      // Asset can come from research path or AI pipeline. We light up both
      // candidates as success since we don't always know the originating
      // branch from the event payload alone.
      return [
        { kind: "node", id: "research", state: "success" },
        { kind: "node", id: "pipeline", state: "success" },
      ];

    case "focal_object_ready":
      return [
        { kind: "node", id: "complete", state: "active" },
      ];

    case "text_delta":
      return [{ kind: "node", id: "pipeline", state: "active" }];

    case "orchestrator_log": {
      const msg = String(event.message ?? "");
      if (/^Safety gate refuse/i.test(msg)) {
        return [{ kind: "node", id: "safety", state: "failed" }];
      }
      if (/^Safety gate clarify/i.test(msg)) {
        return [{ kind: "node", id: "safety", state: "blocked" }];
      }
      return [];
    }

    case "run_completed":
      return [
        { kind: "node", id: "pipeline", state: "success" },
        { kind: "node", id: "research", state: "success" },
        { kind: "node", id: "complete", state: "success" },
      ];

    case "run_failed":
      return [{ kind: "node", id: "complete", state: "failed" }];

    default:
      return [];
  }
}
