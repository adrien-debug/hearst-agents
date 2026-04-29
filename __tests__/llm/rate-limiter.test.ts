import { describe, it, expect, beforeEach } from "vitest";
import { LLMRateLimiter } from "../../lib/llm/rate-limiter";
import { RateLimitExceededError } from "../../lib/llm/errors";

describe("LLMRateLimiter", () => {
  let limiter: LLMRateLimiter;

  beforeEach(() => {
    limiter = new LLMRateLimiter();
  });

  it("allows calls under RPM limit", () => {
    expect(() => limiter.checkLimit("user1")).not.toThrow();
    expect(() => limiter.checkLimit("user1")).not.toThrow();
  });

  it("throws RateLimitExceededError when RPM exceeded", () => {
    process.env.LLM_RATE_LIMIT_RPM = "2";
    const limiter2 = new LLMRateLimiter();

    limiter2.checkLimit("user1");
    limiter2.recordCall("user1");

    limiter2.checkLimit("user1");
    limiter2.recordCall("user1");

    expect(() => limiter2.checkLimit("user1")).toThrow(RateLimitExceededError);
  });

  it("isolates limits per user", () => {
    process.env.LLM_RATE_LIMIT_RPM = "1";
    const limiter2 = new LLMRateLimiter();

    limiter2.checkLimit("user1");
    limiter2.recordCall("user1");

    expect(() => limiter2.checkLimit("user1")).toThrow();

    expect(() => limiter2.checkLimit("user2")).not.toThrow();
  });

  it("tracks token usage for TPH limit", () => {
    limiter.checkLimit("user1");
    limiter.recordCall("user1", 100);
    limiter.recordCall("user1", 200);

    expect(() => limiter.checkLimit("user1")).not.toThrow();
  });

  it("throws RateLimitExceededError when TPH exceeded", () => {
    process.env.LLM_RATE_LIMIT_TPH = "500";
    const limiter2 = new LLMRateLimiter();

    limiter2.checkLimit("user1");
    limiter2.recordCall("user1", 300);

    limiter2.checkLimit("user1");
    limiter2.recordCall("user1", 300);

    expect(() => limiter2.checkLimit("user1")).toThrow(RateLimitExceededError);
  });

  it("resets call count after 60 seconds (mock)", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    limiter.checkLimit("user1");
    limiter.recordCall("user1");

    vi.setSystemTime(now + 61000);

    expect(() => limiter.checkLimit("user1")).not.toThrow();
  });
});

import { vi } from "vitest";
