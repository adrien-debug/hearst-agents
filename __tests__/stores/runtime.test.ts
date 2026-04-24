/**
 * Runtime Store — Tests for state mapping
 *
 * Verifies approval/clarification state transitions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useRuntimeStore, type CoreState } from "@/stores/runtime";

// Helper to get current state
const getRuntimeState = () => useRuntimeStore.getState();

describe("Runtime Store - Approval/Clarification States", () => {
  beforeEach(() => {
    // Reset store to initial state
    useRuntimeStore.setState({
      coreState: "idle" as CoreState,
      flowLabel: null,
      currentRunId: null,
      events: [],
      connected: false,
    });
  });

  it("should map approval_requested to awaiting_approval", () => {
    const { addEvent } = getRuntimeState();

    addEvent({
      type: "approval_requested",
      run_id: "test-run-1",
    });

    const state = getRuntimeState();
    expect(state.coreState).toBe("awaiting_approval");
    expect(state.flowLabel).toBe("Validation requise");
  });

  it("should map clarification_requested to awaiting_clarification", () => {
    const { addEvent } = getRuntimeState();

    addEvent({
      type: "clarification_requested",
      run_id: "test-run-2",
      question: "What is the scope?",
    });

    const state = getRuntimeState();
    expect(state.coreState).toBe("awaiting_clarification");
    expect(state.flowLabel).toBe("Précision requise");
  });

  it("should map run_suspended with awaiting_approval reason", () => {
    const { addEvent } = getRuntimeState();

    addEvent({
      type: "run_suspended",
      run_id: "test-run-3",
      reason: "awaiting_approval",
    });

    const state = getRuntimeState();
    expect(state.coreState).toBe("awaiting_approval");
    expect(state.flowLabel).toBe("Validation requise");
  });

  it("should map run_suspended with awaiting_clarification reason", () => {
    const { addEvent } = getRuntimeState();

    addEvent({
      type: "run_suspended",
      run_id: "test-run-4",
      reason: "awaiting_clarification",
    });

    const state = getRuntimeState();
    expect(state.coreState).toBe("awaiting_clarification");
    expect(state.flowLabel).toBe("Précision requise");
  });

  it("should return to streaming on run_resumed from awaiting_approval", () => {
    const { addEvent } = getRuntimeState();

    // First suspend
    addEvent({
      type: "run_suspended",
      run_id: "test-run-5",
      reason: "awaiting_approval",
    });

    expect(getRuntimeState().coreState).toBe("awaiting_approval");

    // Then resume
    addEvent({
      type: "run_resumed",
      run_id: "test-run-5",
      flow_label: "Continuing...",
    });

    const state = getRuntimeState();
    expect(state.coreState).toBe("streaming");
    expect(state.flowLabel).toBe("Continuing...");
  });

  it("should return to streaming on run_resumed from awaiting_clarification", () => {
    const { addEvent } = getRuntimeState();

    // First suspend
    addEvent({
      type: "run_suspended",
      run_id: "test-run-6",
      reason: "awaiting_clarification",
    });

    expect(getRuntimeState().coreState).toBe("awaiting_clarification");

    // Then resume
    addEvent({
      type: "run_resumed",
      run_id: "test-run-6",
    });

    const state = getRuntimeState();
    expect(state.coreState).toBe("streaming");
    expect(state.flowLabel).toBe("En cours...");
  });

  it("should preserve existing behavior for run_started", () => {
    const { addEvent } = getRuntimeState();

    addEvent({
      type: "run_started",
      run_id: "test-run-7",
      flow_label: "Processing",
    });

    const state = getRuntimeState();
    expect(state.coreState).toBe("streaming");
    expect(state.currentRunId).toBe("test-run-7");
    expect(state.flowLabel).toBe("Processing");
  });

  it("should preserve existing behavior for run_completed", () => {
    const { addEvent } = getRuntimeState();

    // Start run
    addEvent({
      type: "run_started",
      run_id: "test-run-8",
    });

    expect(getRuntimeState().coreState).toBe("streaming");

    // Complete run
    addEvent({
      type: "run_completed",
      run_id: "test-run-8",
    });

    const state = getRuntimeState();
    expect(state.coreState).toBe("processing");
    expect(state.flowLabel).toBeNull();
  });

  it("should preserve existing behavior for run_failed", () => {
    const { addEvent } = getRuntimeState();

    addEvent({
      type: "run_failed",
      run_id: "test-run-9",
      error: "Something went wrong",
    });

    const state = getRuntimeState();
    expect(state.coreState).toBe("error");
    expect(state.flowLabel).toBeNull();
  });
});
