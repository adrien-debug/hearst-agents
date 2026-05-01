import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeAbortSignal, CHAT_TIMEOUT_MS, STREAM_TIMEOUT_MS } from "../../lib/llm/timeout";

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

  it("respects CHAT_TIMEOUT_MS and STREAM_TIMEOUT_MS constants", () => {
    // These are module-level constants set from env vars at import time
    // Verify they are reasonable defaults
    expect(CHAT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(STREAM_TIMEOUT_MS).toBeGreaterThan(CHAT_TIMEOUT_MS);
    expect(CHAT_TIMEOUT_MS).toBe(30000); // default 30s
    expect(STREAM_TIMEOUT_MS).toBe(60000); // default 60s
  });

  it("timeout applies correctly with different durations", () => {
    const shortSignal = makeAbortSignal(100);
    const longSignal = makeAbortSignal(5000);

    expect(shortSignal.aborted).toBe(false);
    expect(longSignal.aborted).toBe(false);

    vi.advanceTimersByTime(100);
    expect(shortSignal.aborted).toBe(true);
    expect(longSignal.aborted).toBe(false);

    vi.advanceTimersByTime(4900);
    expect(longSignal.aborted).toBe(true);
  });
});
