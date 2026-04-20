/**
 * Surface State Model — Chat-first operating model.
 *
 * Chat is always primary. The right panel manifests contextual operating modes,
 * not destinations. There are no secondary "pages" — only runtime context.
 *
 * Pure types + reducer + helpers. No React dependencies.
 */

import type { ProviderId } from "@/lib/providers/types";

// ── Operating Modes (not pages, not destinations) ───────────

/**
 * Consolidated operating modes for the right panel.
 * Each mode is a contextual manifestation, not a navigation target.
 *
 * - inspect   : runtime activity, run timeline, live events (default active mode)
 * - artifact  : produced deliverable detail (report, file, etc.)
 * - proposal  : approval gate, action plan review
 * - mission   : recurring automation lifecycle (draft, active, editing)
 * - idle      : nothing specific to show — panel in rest state
 */
export type OperatingMode =
  | "inspect"
  | "artifact"
  | "proposal"
  | "mission"
  | "idle";

export interface ActiveSurfaceState {
  primary: "chat";
  mode: OperatingMode;
  context: Record<string, unknown>;
}

// ── Intent Flow ─────────────────────────────────────────────

export type IntentFlowStage =
  | "listening"
  | "clarifying"
  | "proposing"
  | "awaiting_validation"
  | "executing"
  | "adjusting"
  | "done";

export interface IntentFlowState {
  stage: IntentFlowStage;
  missionId?: string;
  /** Connection interrupt — not a surface, just a flow state. */
  connectionInterrupt: ConnectionInterrupt | null;
}

export interface ConnectionInterrupt {
  providerId: ProviderId;
  capability: string;
  pendingIntent: string;
  returnToStage: IntentFlowStage;
}

// ── Mission Lifecycle (not "automation config") ─────────────

export type MissionPhase = "proposed" | "active" | "adjusting";

export interface MissionContext {
  missionId?: string;
  phase: MissionPhase;
  intent: string;
  schedule?: string;
  target?: string;
  outputKind?: string;
}

// ── Right Panel State ───────────────────────────────────────

export interface RightPanelState {
  mode: OperatingMode;
  payload: Record<string, unknown>;
}

// ── Primary Action (anti-button model) ──────────────────────

/**
 * Allowed CTA kinds — exhaustive, enforced at type level.
 * Adding a new kind here is a conscious architectural decision.
 */
export type PrimaryActionKind =
  | "approve"
  | "reject"
  | "connect"
  | "send"
  | "delete"
  | "pause";

export interface PrimaryAction {
  label: string;
  kind: PrimaryActionKind;
  execute: () => void;
}

/**
 * Returns 0 or 1 primary action for the current operating mode.
 * Guardrail: each mode can produce at most ONE action.
 * The handler map is intentionally typed to prevent extra entries.
 */
export function getPrimaryAction(
  mode: OperatingMode,
  handlers: {
    onApprove?: () => void;
    onConnect?: () => void;
    onActivateMission?: () => void;
  },
): PrimaryAction | null {
  switch (mode) {
    case "proposal":
      return handlers.onApprove
        ? { label: "Valider", kind: "approve", execute: handlers.onApprove }
        : null;
    case "mission":
      return handlers.onActivateMission
        ? { label: "Activer", kind: "approve", execute: handlers.onActivateMission }
        : null;
    default:
      return null;
  }
}

// ── Surface Actions ─────────────────────────────────────────

export type SurfaceAction =
  | { type: "set_mode"; mode: OperatingMode; context?: Record<string, unknown> }
  | { type: "set_intent_stage"; stage: IntentFlowStage; missionId?: string }
  | { type: "interrupt_for_connection"; providerId: ProviderId; capability: string; pendingIntent: string }
  | { type: "connection_completed" }
  | { type: "propose_mission"; intent: string; schedule?: string; target?: string; outputKind?: string }
  | { type: "activate_mission"; missionId: string }
  | { type: "adjust_mission"; missionId: string }
  | { type: "close_mission" }
  | { type: "reset" };

export interface SurfaceFullState {
  surface: ActiveSurfaceState;
  intentFlow: IntentFlowState;
  rightPanel: RightPanelState;
  mission: MissionContext | null;
}

export function createInitialSurfaceState(): SurfaceFullState {
  return {
    surface: { primary: "chat", mode: "idle", context: {} },
    intentFlow: { stage: "listening", connectionInterrupt: null },
    rightPanel: { mode: "idle", payload: {} },
    mission: null,
  };
}

// ── Stage → mode mapping (intent flow drives panel) ─────────

function modeForStage(stage: IntentFlowStage, hasMission: boolean): OperatingMode {
  switch (stage) {
    case "listening":
    case "clarifying":
    case "done":
      return "idle";
    case "proposing":
    case "awaiting_validation":
      return hasMission ? "mission" : "proposal";
    case "executing":
    case "adjusting":
      return "inspect";
  }
}

// ── Reducer ─────────────────────────────────────────────────

export function surfaceReducer(state: SurfaceFullState, action: SurfaceAction): SurfaceFullState {
  switch (action.type) {
    case "set_mode":
      return {
        ...state,
        surface: { ...state.surface, mode: action.mode, context: action.context ?? {} },
        rightPanel: { mode: action.mode, payload: action.context ?? {} },
      };

    case "set_intent_stage": {
      const stage = action.stage;
      const hasMission = state.mission !== null;
      const derivedMode = modeForStage(stage, hasMission);

      return {
        ...state,
        intentFlow: {
          ...state.intentFlow,
          stage,
          missionId: action.missionId ?? state.intentFlow.missionId,
        },
        surface: { ...state.surface, mode: derivedMode, context: state.surface.context },
        rightPanel: { mode: derivedMode, payload: state.rightPanel.payload },
      };
    }

    case "interrupt_for_connection":
      return {
        ...state,
        intentFlow: {
          ...state.intentFlow,
          connectionInterrupt: {
            providerId: action.providerId,
            capability: action.capability,
            pendingIntent: action.pendingIntent,
            returnToStage: state.intentFlow.stage,
          },
        },
      };

    case "connection_completed": {
      const interrupt = state.intentFlow.connectionInterrupt;
      return {
        ...state,
        intentFlow: {
          ...state.intentFlow,
          connectionInterrupt: null,
          stage: interrupt?.returnToStage ?? state.intentFlow.stage,
        },
      };
    }

    case "propose_mission":
      return {
        ...state,
        mission: {
          phase: "proposed",
          intent: action.intent,
          schedule: action.schedule,
          target: action.target,
          outputKind: action.outputKind,
        },
        intentFlow: { ...state.intentFlow, stage: "proposing" },
        surface: { ...state.surface, mode: "mission", context: { intent: action.intent } },
        rightPanel: { mode: "mission", payload: { intent: action.intent } },
      };

    case "activate_mission":
      return {
        ...state,
        mission: state.mission
          ? { ...state.mission, missionId: action.missionId, phase: "active" }
          : null,
        intentFlow: { ...state.intentFlow, stage: "done", missionId: action.missionId },
        surface: { ...state.surface, mode: "idle", context: {} },
        rightPanel: { mode: "idle", payload: {} },
      };

    case "adjust_mission":
      return {
        ...state,
        mission: state.mission
          ? { ...state.mission, missionId: action.missionId, phase: "adjusting" }
          : null,
        surface: { ...state.surface, mode: "mission", context: { missionId: action.missionId } },
        rightPanel: { mode: "mission", payload: { missionId: action.missionId } },
      };

    case "close_mission":
      return {
        ...state,
        mission: null,
        surface: { ...state.surface, mode: "idle", context: {} },
        rightPanel: { mode: "idle", payload: {} },
      };

    case "reset":
      return createInitialSurfaceState();

    default:
      return state;
  }
}

// ── Legacy route mapping ────────────────────────────────────

/**
 * Legacy pages remain for compatibility.
 * Each maps to a chat intent that replaces the page-as-destination pattern.
 *
 * Removal conditions:
 * - /apps : removable now (connection is inline via chat interrupt)
 * - /inbox : removable when chat can render message summaries inline
 * - /calendar : removable when chat can render calendar view inline
 * - /files : removable when chat can render file list inline
 * - /tasks : removable when chat can render task list inline
 */
export const LEGACY_ROUTE_INTENTS: Record<string, string> = {
  "/inbox": "Résume mes messages",
  "/calendar": "Montre mon agenda",
  "/files": "Montre mes fichiers",
  "/tasks": "Montre mes tâches",
};
