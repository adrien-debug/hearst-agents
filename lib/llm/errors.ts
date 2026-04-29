export class CostLimitExceededError extends Error {
  readonly code = "COST_LIMIT_EXCEEDED";
  readonly name = "CostLimitExceededError";

  constructor(
    public cost_usd: number,
    public limit_usd: number,
    provider: string,
    model: string,
  ) {
    super(`Cost limit exceeded: $${cost_usd.toFixed(4)} > $${limit_usd} for ${provider}/${model}`);
    Object.setPrototypeOf(this, CostLimitExceededError.prototype);
  }
}

export class RateLimitExceededError extends Error {
  readonly code = "RATE_LIMIT_EXCEEDED";
  readonly name = "RateLimitExceededError";

  constructor(
    public userId: string,
    public limitType: "rpm" | "tph",
  ) {
    const limit = limitType === "rpm" ? "calls per minute" : "tokens per hour";
    super(`Rate limit exceeded for user ${userId}: ${limit}`);
    Object.setPrototypeOf(this, RateLimitExceededError.prototype);
  }
}

export class LLMTimeoutError extends Error {
  readonly code = "LLM_TIMEOUT";
  readonly name = "LLMTimeoutError";

  constructor(
    public provider: string,
    public timeoutMs: number,
  ) {
    super(`LLM timeout after ${timeoutMs}ms on provider ${provider}`);
    Object.setPrototypeOf(this, LLMTimeoutError.prototype);
  }
}

export class CircuitOpenError extends Error {
  readonly code = "PROVIDER_UNAVAILABLE";
  readonly name = "CircuitOpenError";

  constructor(public provider: string) {
    super(`Circuit breaker open for provider ${provider}`);
    Object.setPrototypeOf(this, CircuitOpenError.prototype);
  }
}

export function sanitizeProviderError(status: number, body: string): string {
  let sanitized = body;

  sanitized = sanitized.replace(/sk-[A-Za-z0-9]{10,}/g, "[REDACTED_KEY]");

  sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, "Bearer [REDACTED]");

  sanitized = sanitized.replace(
    /"(key|token|secret|authorization|api[_-]?key)"\s*:\s*"[^"]*"/gi,
    `"$1": "[REDACTED]"`,
  );

  sanitized = sanitized.replace(/(ANTHROPIC_API_KEY|OPENAI_API_KEY|GEMINI_API_KEY|COMPOSER_API_KEY)=[^\s&]+/g, "$1=[REDACTED]");

  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200) + "...";
  }

  return `Provider error ${status}: ${sanitized}`;
}
