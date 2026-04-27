import { describe, it, expect } from "vitest";
import {
  reduceToolEvents,
  selectCompletedWrites,
} from "@/app/(user)/components/chat-tool-stream-reducer";
import type { StreamEvent } from "@/stores/runtime";

// The runtime store stores events newest-first (it prepends). Helper that
// builds a store-shaped array from a chronological event list.
function fromChronological(
  events: Array<{ type: string; [key: string]: unknown }>,
): StreamEvent[] {
  return events
    .map((e, i): StreamEvent => ({ ...e, timestamp: 1_000_000 + i }))
    .reverse();
}

describe("reduceToolEvents", () => {
  it("returns [] when no run is active", () => {
    expect(reduceToolEvents([], null)).toEqual([]);
  });

  it("ignores events from other runs", () => {
    const events = fromChronological([
      { type: "tool_call_started", run_id: "run-a", step_id: "s1", tool: "google.calendar.list_today_events" },
      { type: "tool_call_started", run_id: "run-b", step_id: "s2", tool: "google.gmail.list_recent_messages" },
    ]);
    const out = reduceToolEvents(events, "run-a");
    expect(out).toHaveLength(1);
    expect(out[0].stepId).toBe("s1");
  });

  it("preserves start order across runs (oldest-first in output)", () => {
    const events = fromChronological([
      { type: "tool_call_started", run_id: "run-1", step_id: "s_cal", tool: "google.calendar.list_today_events" },
      { type: "tool_call_started", run_id: "run-1", step_id: "s_mail", tool: "google.gmail.list_recent_messages" },
      { type: "tool_call_started", run_id: "run-1", step_id: "s_drive", tool: "google.drive.list_recent_files" },
    ]);
    const out = reduceToolEvents(events, "run-1");
    expect(out.map((e) => e.stepId)).toEqual(["s_cal", "s_mail", "s_drive"]);
  });

  it("transitions running → completed when a completion event arrives", () => {
    const events = fromChronological([
      { type: "tool_call_started", run_id: "r", step_id: "s_cal", tool: "google.calendar.list_today_events" },
      { type: "tool_call_completed", run_id: "r", step_id: "s_cal", tool: "google.calendar.list_today_events" },
      { type: "tool_call_started", run_id: "r", step_id: "s_mail", tool: "google.gmail.list_recent_messages" },
    ]);
    const out = reduceToolEvents(events, "r");
    expect(out).toEqual([
      expect.objectContaining({ stepId: "s_cal", status: "completed" }),
      expect.objectContaining({ stepId: "s_mail", status: "running" }),
    ]);
  });

  it("dedupes a step_id if the same tool_call_started event is seen twice", () => {
    const events = fromChronological([
      { type: "tool_call_started", run_id: "r", step_id: "s_cal", tool: "google.calendar.list_today_events" },
      { type: "tool_call_started", run_id: "r", step_id: "s_cal", tool: "google.calendar.list_today_events" },
    ]);
    const out = reduceToolEvents(events, "r");
    expect(out).toHaveLength(1);
  });

  it("skips malformed tool_call_started events lacking step_id or tool", () => {
    const events = fromChronological([
      { type: "tool_call_started", run_id: "r", step_id: "", tool: "google.calendar.list_today_events" },
      { type: "tool_call_started", run_id: "r", step_id: "s_ok", tool: "" },
      { type: "tool_call_started", run_id: "r", step_id: "s_real", tool: "google.gmail.list_recent_messages" },
    ]);
    const out = reduceToolEvents(events, "r");
    expect(out).toHaveLength(1);
    expect(out[0].stepId).toBe("s_real");
  });

  it("classifies entries as 'read' or 'write' from the catalog", () => {
    const events = fromChronological([
      { type: "tool_call_started", run_id: "r", step_id: "s_read", tool: "google.gmail.list_recent_messages" },
      { type: "tool_call_started", run_id: "r", step_id: "s_write", tool: "gmail_send_email" },
    ]);
    const out = reduceToolEvents(events, "r");
    expect(out.find((e) => e.stepId === "s_read")?.kind).toBe("read");
    expect(out.find((e) => e.stepId === "s_write")?.kind).toBe("write");
  });
});

describe("selectCompletedWrites", () => {
  it("returns only completed write entries", () => {
    const events = fromChronological([
      { type: "tool_call_started", run_id: "r", step_id: "s_read", tool: "google.gmail.list_recent_messages" },
      { type: "tool_call_completed", run_id: "r", step_id: "s_read", tool: "google.gmail.list_recent_messages" },
      { type: "tool_call_started", run_id: "r", step_id: "s_write_running", tool: "gmail_send_email" },
      { type: "tool_call_started", run_id: "r", step_id: "s_write_done", tool: "gmail_send_email" },
      { type: "tool_call_completed", run_id: "r", step_id: "s_write_done", tool: "gmail_send_email" },
    ]);
    const out = selectCompletedWrites(events, "r");
    expect(out).toHaveLength(1);
    expect(out[0].stepId).toBe("s_write_done");
  });

  it("returns [] when no run is provided", () => {
    expect(selectCompletedWrites([], null)).toEqual([]);
  });
});
