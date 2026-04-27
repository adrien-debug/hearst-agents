/**
 * Selector logic for ChatConnectInline — tested in isolation so we don't
 * need a DOM. The full React render is covered by the e2e tests.
 */

import { describe, it, expect } from "vitest";
import type { StreamEvent } from "@/stores/runtime";

// Replicate the same shape used in the component (kept private there but
// trivial enough that we re-derive it for the test).
function selectLatestConnectRequest(
  events: StreamEvent[],
  runId: string | null,
): { app: string; reason: string } | null {
  if (!runId) return null;
  for (const ev of events) {
    if (ev.run_id !== runId) continue;
    if (ev.type === "app_connect_required") {
      const app = String(ev.app ?? "").trim().toLowerCase();
      const reason = String(ev.reason ?? "").trim();
      if (!app) return null;
      return { app, reason };
    }
  }
  return null;
}

function fromChronological(
  events: Array<{ type: string; [key: string]: unknown }>,
): StreamEvent[] {
  return events
    .map((e, i): StreamEvent => ({ ...e, timestamp: 1_000_000 + i }))
    .reverse(); // newest-first as the store stores them
}

describe("ChatConnectInline selector", () => {
  it("returns null when no runId is provided", () => {
    expect(selectLatestConnectRequest([], null)).toBeNull();
  });

  it("returns null when there is no app_connect_required event", () => {
    const events = fromChronological([
      { type: "text_delta", run_id: "r", delta: "ok" },
      { type: "tool_call_started", run_id: "r", step_id: "s1", tool: "google.gmail.list_recent_messages" },
    ]);
    expect(selectLatestConnectRequest(events, "r")).toBeNull();
  });

  it("returns the latest app_connect_required for the given run", () => {
    const events = fromChronological([
      { type: "app_connect_required", run_id: "r", app: "Slack", reason: "first reason" },
      { type: "text_delta", run_id: "r", delta: "blah" },
      { type: "app_connect_required", run_id: "r", app: "NOTION", reason: "second reason" },
    ]);
    const out = selectLatestConnectRequest(events, "r");
    expect(out).toEqual({ app: "notion", reason: "second reason" });
  });

  it("ignores app_connect_required events from other runs", () => {
    const events = fromChronological([
      { type: "app_connect_required", run_id: "other", app: "slack", reason: "X" },
    ]);
    expect(selectLatestConnectRequest(events, "r")).toBeNull();
  });

  it("returns null when the event is malformed (empty app)", () => {
    const events = fromChronological([
      { type: "app_connect_required", run_id: "r", app: "", reason: "X" },
    ]);
    expect(selectLatestConnectRequest(events, "r")).toBeNull();
  });
});
