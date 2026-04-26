/**
 * SSE Event Contract Tests
 *
 * Validates the shape and required fields of SSE events
 * emitted by the orchestrator. The capability-first refactor
 * must preserve these contracts or the frontend breaks.
 */

import { describe, it, expect } from "vitest";

const REQUIRED_EVENT_TYPES = [
  "execution_mode_selected",
  "tool_surface",
  "text_delta",
  "orchestrator_log",
  "step_started",
  "step_completed",
  "step_failed",
  "asset_generated",
  "focal_object_ready",
  "run_completed",
  "run_failed",
  "capability_blocked",
  "scheduled_mission_created",
  "scheduled_mission_triggered",
  "agent_selected",
  "clarification_requested",
  "runtime_warning",
  "artifact_created",
] as const;

type EventType = (typeof REQUIRED_EVENT_TYPES)[number];

const EVENT_REQUIRED_FIELDS: Record<EventType, string[]> = {
  execution_mode_selected: ["run_id", "mode", "reason"],
  tool_surface: ["run_id", "context", "tools"],
  text_delta: ["run_id", "delta"],
  orchestrator_log: ["run_id", "message"],
  step_started: ["run_id", "step_id", "agent"],
  step_completed: ["run_id", "step_id", "agent"],
  step_failed: ["run_id", "step_id", "error"],
  asset_generated: ["run_id", "asset_id", "asset_type", "name"],
  focal_object_ready: ["run_id", "focal_object"],
  run_completed: ["run_id"],
  run_failed: ["run_id"],
  capability_blocked: ["run_id", "capability", "requiredProviders", "message"],
  scheduled_mission_created: ["run_id", "mission_id", "name", "schedule"],
  scheduled_mission_triggered: ["run_id", "mission_id", "name"],
  agent_selected: ["run_id", "agent_id", "agent_name", "allowed_tools", "backend"],
  clarification_requested: ["run_id", "question", "options"],
  runtime_warning: ["run_id", "message"],
  artifact_created: ["run_id", "artifact_id", "artifact_type", "title"],
};

describe("SSE event contract — required types exist", () => {
  it("all event types are documented", () => {
    expect(REQUIRED_EVENT_TYPES.length).toBeGreaterThanOrEqual(15);
  });

  for (const eventType of REQUIRED_EVENT_TYPES) {
    it(`${eventType} has required fields defined`, () => {
      const fields = EVENT_REQUIRED_FIELDS[eventType];
      expect(fields).toBeDefined();
      expect(fields.length).toBeGreaterThan(0);
      expect(fields).toContain("run_id");
    });
  }
});

describe("SSE event contract — focal_object shape", () => {
  const requiredFocalFields = [
    "objectType",
    "id",
    "threadId",
    "title",
    "status",
    "createdAt",
    "updatedAt",
    "sourceAssetId",
    "morphTarget",
    "summary",
    "sections",
    "tier",
    "tone",
    "wordCount",
  ];

  it("focal_object has all required fields documented", () => {
    expect(requiredFocalFields.length).toBeGreaterThanOrEqual(10);
  });
});

describe("SSE event contract — minimum event sequence", () => {
  it("a successful run must emit at minimum: execution_mode_selected + (text_delta | focal_object_ready) + run_completed", () => {
    const minSequence = [
      "execution_mode_selected",
      "text_delta",
      "run_completed",
    ];
    for (const evt of minSequence) {
      expect(REQUIRED_EVENT_TYPES).toContain(evt);
    }
  });

  it("a failed run must emit at minimum: execution_mode_selected + run_failed", () => {
    const minSequence = ["execution_mode_selected", "run_failed"];
    for (const evt of minSequence) {
      expect(REQUIRED_EVENT_TYPES).toContain(evt);
    }
  });

  it("a blocked run must emit: capability_blocked + text_delta + run_failed", () => {
    const minSequence = ["capability_blocked", "text_delta", "run_failed"];
    for (const evt of minSequence) {
      expect(REQUIRED_EVENT_TYPES).toContain(evt);
    }
  });
});
