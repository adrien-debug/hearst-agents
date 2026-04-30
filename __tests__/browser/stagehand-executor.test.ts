/**
 * lib/browser/stagehand-executor — émission d'events + abort + cap.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  runBrowserTask,
  requestTakeOver,
  markUserControlled,
  isSessionUserControlled,
  clearUserControlled,
} from "@/lib/browser/stagehand-executor";
import { globalRunBus } from "@/lib/events/global-bus";
import type { RunEvent } from "@/lib/events/types";

function captureEvents(): { events: RunEvent[]; unsub: () => void } {
  const events: RunEvent[] = [];
  const unsub = globalRunBus.subscribe((e) => events.push(e));
  return { events, unsub };
}

describe("runBrowserTask", () => {
  beforeEach(() => {
    clearUserControlled("sess-1");
  });

  it("émet browser_action puis browser_task_completed", async () => {
    const { events, unsub } = captureEvents();
    const result = await runBrowserTask({
      sessionId: "sess-1",
      task: "Va sur https://example.com et observe",
    });
    unsub();

    expect(result.totalActions).toBeGreaterThan(0);
    expect(result.aborted).toBe(false);
    const types = events.map((e) => e.type);
    expect(types).toContain("browser_action");
    expect(types).toContain("browser_task_completed");
  });

  it("émet une action navigate avec URL extraite", async () => {
    const { events, unsub } = captureEvents();
    await runBrowserTask({
      sessionId: "sess-1",
      task: "ouvre https://example.com",
    });
    unsub();
    const nav = events.find(
      (e) => e.type === "browser_action" && e.action.type === "navigate",
    );
    expect(nav).toBeDefined();
    if (nav && nav.type === "browser_action") {
      expect(nav.action.target).toBe("https://example.com");
    }
  });

  it("respecte testActions en mode replay", async () => {
    const { events, unsub } = captureEvents();
    const result = await runBrowserTask({
      sessionId: "sess-1",
      task: "replay",
      testActions: [
        { type: "navigate", target: "https://a.com" },
        { type: "click", target: "button.cta" },
      ],
    });
    unsub();
    expect(result.totalActions).toBe(2);
    const actions = events.filter((e) => e.type === "browser_action");
    expect(actions).toHaveLength(2);
  });

  it("requestTakeOver interrompt la run et émet browser_take_over", async () => {
    const { events, unsub } = captureEvents();
    const promise = runBrowserTask({
      sessionId: "sess-1",
      task: "https://slow.com",
    });
    // Petite attente pour que registerActiveRun soit posé.
    await new Promise((r) => setTimeout(r, 30));
    const stopped = requestTakeOver("sess-1");
    expect(stopped).toBe(true);
    const result = await promise;
    unsub();

    expect(result.aborted).toBe(true);
    const types = events.map((e) => e.type);
    expect(types).toContain("browser_take_over");
    expect(types).toContain("browser_task_failed");
  });

  it("markUserControlled bascule isSessionUserControlled", () => {
    expect(isSessionUserControlled("sess-1")).toBe(false);
    markUserControlled("sess-1");
    expect(isSessionUserControlled("sess-1")).toBe(true);
    clearUserControlled("sess-1");
    expect(isSessionUserControlled("sess-1")).toBe(false);
  });

  it("cap maxActions stoppe la boucle", async () => {
    const result = await runBrowserTask({
      sessionId: "sess-1",
      task: "replay",
      maxActions: 1,
      testActions: [
        { type: "navigate", target: "a" },
        { type: "click", target: "b" },
        { type: "click", target: "c" },
      ],
    });
    expect(result.totalActions).toBe(1);
  });
});
