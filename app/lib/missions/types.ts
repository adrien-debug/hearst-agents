/* ─── Surfaces ─── */

export type Surface = "home" | "inbox" | "calendar" | "files" | "tasks" | "apps";

/* ─── Action statuses ─── */

export type ActionStatus = "done" | "in_progress" | "waiting" | "error" | "needs_approval";

/* ─── Mission statuses ─── */

export type MissionStatus = "created" | "running" | "awaiting_approval" | "completed" | "failed" | "cancelled";

/* ─── Mission action ─── */

export interface MissionAction {
  id: string;
  label: string;
  status: ActionStatus;
  service?: string;
  preview?: string;
  error?: string;
}

/* ─── Mission ─── */

export interface Mission {
  id: string;
  title: string;
  surface: Surface;
  status: MissionStatus;
  actions: MissionAction[];
  result?: string;
  resultData?: Record<string, unknown>;
  error?: string;
  services: string[];
  createdAt: number;
  updatedAt: number;
}

/* ─── Events (state machine transitions) ─── */

export type MissionEvent =
  | { type: "mission_created"; mission: Mission }
  | { type: "mission_started"; missionId: string }
  | { type: "step_started"; missionId: string; actionId: string }
  | { type: "step_completed"; missionId: string; actionId: string; preview?: string }
  | { type: "step_failed"; missionId: string; actionId: string; error: string }
  | { type: "step_needs_approval"; missionId: string; actionId: string }
  | { type: "mission_awaiting_approval"; missionId: string }
  | { type: "mission_completed"; missionId: string; result: string; resultData?: Record<string, unknown> }
  | { type: "mission_failed"; missionId: string; error: string }
  | { type: "mission_cancelled"; missionId: string }
  | { type: "mission_dismissed"; missionId: string };

/* ─── Chat outcome (intent result) ─── */

export type ChatOutcome =
  | { type: "reply"; content: string }
  | { type: "mission"; mission: Mission; chatMessage?: string }
  | { type: "navigate"; surface: Surface; chatMessage?: string };

/* ─── Serializable snapshot for persistence ─── */

export interface MissionSnapshot {
  missions: Mission[];
  activeMissionId: string | null;
  activeSurface: Surface;
}
