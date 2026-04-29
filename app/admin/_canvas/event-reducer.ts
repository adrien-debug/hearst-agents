/**
 * Réducteur pur event → canvas-state diff.
 *
 * Découplé de React + zustand — testable en isolation, réutilisé pour le live
 * SSE et le replay. Retourne une liste d'opérations sans effets de bord.
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
 * Mappe un event SSE en liste d'opérations canvas.
 *
 * Règles :
 *  - run_started          → reset + entry active
 *  - execution_mode_selected → entry/router success, safety active→success, intent active
 *  - capability_blocked   → safety blocked
 *  - app_connect_required → preflight blocked
 *  - tool_surface         → intent/preflight success, tools active
 *  - agent_selected       → tools success, agent success
 *  - tool_call_started    → tools success, pipeline active + packet
 *  - tool_call_completed  → pipeline success
 *  - step_started research → tools success, research active + packet
 *  - asset_generated      → research success, pipeline success
 *  - text_delta           → pipeline active
 *  - orchestrator_log Safety gate → safety failed / blocked
 *  - run_completed        → pipeline success, complete success (research inchangé)
 *  - run_failed           → complete failed
 */
export function reduceEvent(event: MinEvent): CanvasOp[] {
  switch (event.type) {
    case "run_started":
      return [
        { kind: "reset" },
        { kind: "node", id: "entry", state: "active" },
      ];

    case "execution_mode_selected":
      // Safety est traversée en happy path : elle est active puis immédiatement
      // success avant de passer le relais à intent. Sans cela, safety reste idle
      // sur tout le run normal.
      return [
        { kind: "node", id: "entry", state: "success" },
        { kind: "node", id: "router", state: "success" },
        { kind: "node", id: "safety", state: "active" },
        { kind: "node", id: "safety", state: "success" },
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
      return [{ kind: "node", id: "pipeline", state: "success" }];

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
      return [
        { kind: "node", id: "research", state: "success" },
        { kind: "node", id: "pipeline", state: "success" },
      ];

    case "focal_object_ready":
      return [{ kind: "node", id: "complete", state: "active" }];

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
      // research n'est pas forcé ici : si la branche research n'a pas été active,
      // elle reste idle. asset_generated a déjà posé research à success si besoin.
      return [
        { kind: "node", id: "pipeline", state: "success" },
        { kind: "node", id: "complete", state: "success" },
      ];

    case "run_failed":
      return [{ kind: "node", id: "complete", state: "failed" }];

    default:
      return [];
  }
}
