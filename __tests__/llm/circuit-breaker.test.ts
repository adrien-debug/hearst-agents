import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { LLMCircuitBreaker } from "../../lib/llm/circuit-breaker";

describe("LLMCircuitBreaker", () => {
  let breaker: LLMCircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new LLMCircuitBreaker();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in CLOSED state", () => {
    expect(breaker.isOpen("provider1")).toBe(false);
    expect(breaker.getState("provider1")).toBe("CLOSED");
  });

  it("opens after 5 failures", () => {
    for (let i = 0; i < 4; i++) {
      breaker.recordFailure("provider1");
      expect(breaker.isOpen("provider1")).toBe(false);
    }

    breaker.recordFailure("provider1");
    expect(breaker.isOpen("provider1")).toBe(true);
    expect(breaker.getState("provider1")).toBe("OPEN");
  });

  it("transitions to HALF_OPEN after 60s from OPEN", () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure("provider1");
    }
    expect(breaker.getState("provider1")).toBe("OPEN");

    vi.advanceTimersByTime(59000);
    expect(breaker.isOpen("provider1")).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(breaker.getState("provider1")).toBe("HALF_OPEN");
    expect(breaker.isOpen("provider1")).toBe(false);
  });

  it("closes on success in HALF_OPEN", () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure("provider1");
    }
    vi.advanceTimersByTime(60000);

    expect(breaker.getState("provider1")).toBe("HALF_OPEN");
    breaker.recordSuccess("provider1");
    expect(breaker.getState("provider1")).toBe("CLOSED");
  });

  it("reopens on failure in HALF_OPEN", () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure("provider1");
    }
    vi.advanceTimersByTime(60000);

    breaker.recordFailure("provider1");
    expect(breaker.getState("provider1")).toBe("OPEN");
  });

  it("resets failure count on success in CLOSED", () => {
    breaker.recordFailure("provider1");
    breaker.recordFailure("provider1");

    breaker.recordSuccess("provider1");

    for (let i = 0; i < 4; i++) {
      breaker.recordFailure("provider1");
    }
    expect(breaker.isOpen("provider1")).toBe(false);
  });

  it("isolates circuits per provider", () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure("provider1");
    }
    expect(breaker.isOpen("provider1")).toBe(true);
    expect(breaker.isOpen("provider2")).toBe(false);
  });
});
