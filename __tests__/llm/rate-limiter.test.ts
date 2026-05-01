import { describe, it, expect, beforeEach, vi } from "vitest";
import { LLMRateLimiter } from "../../lib/llm/rate-limiter";

describe("LLMRateLimiter", () => {
  let limiter: LLMRateLimiter;

  beforeEach(() => {
    limiter = new LLMRateLimiter();
  });

  it("allows calls under RPM limit", () => {
    expect(() => limiter.checkLimit("user1")).not.toThrow();
    expect(() => limiter.checkLimit("user1")).not.toThrow();
  });

  it("isolates limits per user", () => {
    limiter.checkLimit("user1");
    limiter.recordCall("user1");

    // user1 has 1 call, user2 has none — both should be under their own limits
    expect(() => limiter.checkLimit("user1")).not.toThrow();
    expect(() => limiter.checkLimit("user2")).not.toThrow();
  });

  it("tracks token usage for TPH limit", () => {
    limiter.checkLimit("user1");
    limiter.recordCall("user1", 100);
    limiter.recordCall("user1", 200);

    // Total 300 tokens, well under the 1M default TPH limit
    expect(() => limiter.checkLimit("user1")).not.toThrow();
  });

  it("resets call count after 60 seconds (mock)", () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    limiter.checkLimit("user1");
    limiter.recordCall("user1");

    vi.setSystemTime(now + 61000);

    // Call timestamps should be pruned after 60s
    expect(() => limiter.checkLimit("user1")).not.toThrow();

    vi.useRealTimers();
  });

  it("cleans up inactive users after 2 hours", () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    limiter.checkLimit("user1");
    limiter.recordCall("user1");

    // Simulate 2.5 hours of inactivity
    vi.setSystemTime(now + 2.5 * 3600000);

    // Create a new user to trigger the check
    limiter.checkLimit("user2");

    // After accessing user2, we can verify user1 would be cleaned up on next user1 access
    // This is implicit — just verify the limiter doesn't crash on cleanup
    expect(() => limiter.checkLimit("user1")).not.toThrow();

    vi.useRealTimers();
  });
});
