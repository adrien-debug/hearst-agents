import { describe, it, expect } from "vitest";
import {
  CostLimitExceededError,
  RateLimitExceededError,
  LLMTimeoutError,
  CircuitOpenError,
  sanitizeProviderError,
} from "../../lib/llm/errors";

describe("error classes", () => {
  it("creates CostLimitExceededError with correct code", () => {
    const err = new CostLimitExceededError(0.1, 0.05, "openai", "gpt-4");
    expect(err.code).toBe("COST_LIMIT_EXCEEDED");
    expect(err.cost_usd).toBe(0.1);
    expect(err.limit_usd).toBe(0.05);
    expect(err.message).toContain("Cost limit exceeded");
  });

  it("creates RateLimitExceededError with correct code", () => {
    const err = new RateLimitExceededError("user123", "rpm");
    expect(err.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(err.userId).toBe("user123");
    expect(err.limitType).toBe("rpm");
  });

  it("creates LLMTimeoutError with correct code", () => {
    const err = new LLMTimeoutError("openai", 30000);
    expect(err.code).toBe("LLM_TIMEOUT");
    expect(err.provider).toBe("openai");
    expect(err.timeoutMs).toBe(30000);
  });

  it("creates CircuitOpenError with correct code", () => {
    const err = new CircuitOpenError("gemini");
    expect(err.code).toBe("PROVIDER_UNAVAILABLE");
    expect(err.provider).toBe("gemini");
  });
});

describe("sanitizeProviderError", () => {
  it("strips sk- prefixed API keys", () => {
    const body = `error: API key sk-abc123def456ghi789jkl12 failed`;
    const result = sanitizeProviderError(400, body);
    expect(result).toContain("[REDACTED_KEY]");
    expect(result).not.toContain("sk-abc123");
  });

  it("strips Bearer tokens", () => {
    const body = `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9`;
    const result = sanitizeProviderError(401, body);
    expect(result).toContain("Bearer [REDACTED]");
    expect(result).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
  });

  it("redacts JSON sensitive fields", () => {
    const body = JSON.stringify({
      error: "auth failed",
      api_key: "secret-key-12345",
      token: "bearer-token-xyz",
      secret: "my-secret",
    });
    const result = sanitizeProviderError(401, body);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("secret-key-12345");
    expect(result).not.toContain("bearer-token-xyz");
  });

  it("redacts env-var style secrets", () => {
    const body = `Config: ANTHROPIC_API_KEY=sk-ant-abc123xyz789 OPENAI_API_KEY=sk-proj-def456uvw123`;
    const result = sanitizeProviderError(500, body);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("sk-ant-abc123xyz789");
  });

  it("truncates to 200 chars after sanitization", () => {
    const longBody = "x".repeat(300);
    const result = sanitizeProviderError(500, longBody);
    expect(result.length).toBeLessThanOrEqual(250);
  });

  it("includes status code in output", () => {
    const result = sanitizeProviderError(503, "server error");
    expect(result).toContain("503");
  });
});
