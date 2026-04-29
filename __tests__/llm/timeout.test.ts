import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeAbortSignal, CHAT_TIMEOUT_MS, STREAM_TIMEOUT_MS } from "../../lib/llm/timeout";
import { LLMTimeoutError } from "../../lib/llm/errors";

describe("makeAbortSignal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts after timeout duration", () => {
    const signal = makeAbortSignal(1000);
    expect(signal.aborted).toBe(false);

    vi.advanceTimersByTime(999);
    expect(signal.aborted).toBe(false);

    vi.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
  });

  it("propagates user signal abort", () => {
    const userController = new AbortController();
    const signal = makeAbortSignal(5000, userController.signal);

    expect(signal.aborted).toBe(false);

    userController.abort(new Error("user cancelled"));
    vi.runAllTimers();

    expect(signal.aborted).toBe(true);
  });

  it("returns early if user signal already aborted", () => {
    const userController = new AbortController();
    userController.abort();

    const signal = makeAbortSignal(5000, userController.signal);
    expect(signal.aborted).toBe(true);
  });

  it("clears timeout when signal aborts", () => {
    const controller = new AbortController();
    const timeoutSpy = vi.spyOn(global, "setTimeout");

    const signal = makeAbortSignal(1000);

    controller.abort();
    vi.advanceTimersByTime(500);
    expect(signal.aborted).toBe(false);
  });

  it("respects env vars for timeout defaults", () => {
    process.env.LLM_CHAT_TIMEOUT_MS = "45000";
    process.env.LLM_STREAM_TIMEOUT_MS = "90000";

    expect(CHAT_TIMEOUT_MS).toBe(45000);
    expect(STREAM_TIMEOUT_MS).toBe(90000);
  });
});
