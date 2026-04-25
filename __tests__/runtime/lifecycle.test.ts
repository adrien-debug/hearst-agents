import { describe, it, expect } from "vitest";
import {
  canTransitionRun,
  canTransitionTrace,
  assertRunTransition,
  RuntimeError,
  withTimeout,
  withRetry,
  DEFAULT_TIMEOUTS,
  DEFAULT_RETRY,
} from "@/lib/engine/runtime/lifecycle";

describe("Run status transitions", () => {
  it("allows pending → running", () => {
    expect(canTransitionRun("pending", "running")).toBe(true);
  });

  it("allows pending → cancelled", () => {
    expect(canTransitionRun("pending", "cancelled")).toBe(true);
  });

  it("allows running → completed", () => {
    expect(canTransitionRun("running", "completed")).toBe(true);
  });

  it("allows running → failed", () => {
    expect(canTransitionRun("running", "failed")).toBe(true);
  });

  it("allows running → timeout", () => {
    expect(canTransitionRun("running", "timeout")).toBe(true);
  });

  it("denies pending → completed", () => {
    expect(canTransitionRun("pending", "completed")).toBe(false);
  });

  it("denies completed → running", () => {
    expect(canTransitionRun("completed", "running")).toBe(false);
  });

  it("denies failed → completed", () => {
    expect(canTransitionRun("failed", "completed")).toBe(false);
  });

  it("denies timeout → running", () => {
    expect(canTransitionRun("timeout", "running")).toBe(false);
  });

  it("denies cancelled → running", () => {
    expect(canTransitionRun("cancelled", "running")).toBe(false);
  });

  it("assertRunTransition throws on invalid transition", () => {
    expect(() => assertRunTransition("completed", "running")).toThrow(RuntimeError);
    try {
      assertRunTransition("completed", "running");
    } catch (e) {
      expect((e as RuntimeError).code).toBe("INVALID_TRANSITION");
    }
  });

  it("assertRunTransition passes on valid transition", () => {
    expect(() => assertRunTransition("running", "completed")).not.toThrow();
  });
});

describe("Trace status transitions", () => {
  it("allows pending → running", () => {
    expect(canTransitionTrace("pending", "running")).toBe(true);
  });

  it("allows pending → skipped", () => {
    expect(canTransitionTrace("pending", "skipped")).toBe(true);
  });

  it("allows running → completed", () => {
    expect(canTransitionTrace("running", "completed")).toBe(true);
  });

  it("allows running → failed", () => {
    expect(canTransitionTrace("running", "failed")).toBe(true);
  });

  it("allows running → timeout", () => {
    expect(canTransitionTrace("running", "timeout")).toBe(true);
  });

  it("denies completed → running", () => {
    expect(canTransitionTrace("completed", "running")).toBe(false);
  });

  it("denies skipped → completed", () => {
    expect(canTransitionTrace("skipped", "completed")).toBe(false);
  });
});

describe("RuntimeError", () => {
  it("carries code and message", () => {
    const err = new RuntimeError("TIMEOUT", "timed out");
    expect(err.code).toBe("TIMEOUT");
    expect(err.message).toBe("timed out");
    expect(err.retryable).toBe(false);
    expect(err.name).toBe("RuntimeError");
  });

  it("supports retryable flag", () => {
    const err = new RuntimeError("STEP_FAILED", "http 500", true);
    expect(err.retryable).toBe(true);
  });
});

describe("withTimeout", () => {
  it("resolves before timeout", async () => {
    const result = await withTimeout(
      Promise.resolve(42),
      1000,
      "test",
    );
    expect(result).toBe(42);
  });

  it("rejects on timeout", async () => {
    const slow = new Promise<number>((resolve) => setTimeout(() => resolve(42), 500));
    try {
      await withTimeout(slow, 50, "test");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RuntimeError);
      expect((e as RuntimeError).code).toBe("TIMEOUT");
    }
  });

  it("propagates original error if promise rejects before timeout", async () => {
    const failing = Promise.reject(new Error("original error"));
    await expect(withTimeout(failing, 1000, "test")).rejects.toThrow("original error");
  });
});

describe("withRetry", () => {
  it("succeeds on first attempt without retry", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => { calls++; return "ok"; },
      DEFAULT_RETRY,
      "test",
    );
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries on retryable error", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new RuntimeError("STEP_FAILED", "retry me", true);
        return "ok";
      },
      { max_retries: 3, backoff_ms: 10, backoff_multiplier: 1 },
      "test",
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("throws MAX_RETRIES_EXCEEDED when exhausted", async () => {
    try {
      await withRetry(
        async () => { throw new RuntimeError("STEP_FAILED", "always fail", true); },
        { max_retries: 2, backoff_ms: 10, backoff_multiplier: 1 },
        "test",
      );
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RuntimeError);
      expect((e as RuntimeError).code).toBe("MAX_RETRIES_EXCEEDED");
    }
  });

  it("does not retry non-retryable errors", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => { calls++; throw new RuntimeError("TOOL_KILL_SWITCH", "blocked"); },
        { max_retries: 3, backoff_ms: 10, backoff_multiplier: 1 },
        "test",
      ),
    ).rejects.toThrow("blocked");
    expect(calls).toBe(1);
  });
});

describe("DEFAULT_TIMEOUTS", () => {
  it("has reasonable defaults", () => {
    expect(DEFAULT_TIMEOUTS.run_timeout_ms).toBe(300_000);
    expect(DEFAULT_TIMEOUTS.step_timeout_ms).toBe(120_000);
    expect(DEFAULT_TIMEOUTS.tool_timeout_ms).toBe(30_000);
    expect(DEFAULT_TIMEOUTS.llm_timeout_ms).toBe(60_000);
  });
});
