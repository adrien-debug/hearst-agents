/**
 * @deprecated Legacy client mission barrel export.
 * Canonical mission system: lib/runtime/missions/*, /api/v2/missions*, app/lib/missions-v2.ts.
 * Still used by ControlPanel (v1 mission panel) and GlobalChat (detectIntent, executeMission).
 */
export type {
  Surface,
  ActionStatus,
  MissionStatus,
  MissionAction,
  Mission,
  MissionEvent,
  ChatOutcome,
  MissionSnapshot,
} from "./types";

export { MissionRegistry, getMissionRegistry } from "./registry";
export { detectIntent, detectIntentWithFallback } from "./intent";
export { executeMission, executeReplyMission, cancelMission, approveMission } from "./orchestrator";
export { MissionProvider, useMission } from "./use-mission";
