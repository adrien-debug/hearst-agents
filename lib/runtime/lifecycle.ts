/**
 * Canonical runtime lifecycle definitions.
 *
 * All run/trace statuses, allowed transitions, typed errors,
 * timeout model, retry model, and trace payload contracts.
 */

// ── Run statuses ──────────────────────────────────────────

export type RunStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "timeout";

const RUN_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  pending:   ["running", "cancelled"],
  running:   ["completed", "failed", "cancelled", "timeout"],
  completed: [],
  failed:    [],
  cancelled: [],
  timeout:   [],
};

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return RUN_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransitionRun(from, to)) {
    throw new RuntimeError(
      "INVALID_TRANSITION",
      `Run cannot transition from '${from}' to '${to}'`,
    );
  }
}

// ── Trace statuses ────────────────────────────────────────

export type TraceStatus = "pending" | "running" | "completed" | "failed" | "skipped" | "timeout";

const TRACE_TRANSITIONS: Record<TraceStatus, TraceStatus[]> = {
  pending:   ["running", "skipped"],
  running:   ["completed", "failed", "timeout"],
  completed: [],
  failed:    [],
  skipped:   [],
  timeout:   [],
};

export function canTransitionTrace(from: TraceStatus, to: TraceStatus): boolean {
  return TRACE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Run triggers ──────────────────────────────────────────

export type RunTrigger = "api" | "workflow" | "schedule" | "replay" | "eval";

// ── Typed runtime errors ──────────────────────────────────

export type RuntimeErrorCode =
  | "INVALID_TRANSITION"
  | "RUN_NOT_STARTED"
  | "RUN_ALREADY_FINISHED"
  | "TIMEOUT"
  | "MAX_RETRIES_EXCEEDED"
  | "TOOL_DISABLED"
  | "TOOL_KILL_SWITCH"
  | "TOOL_RISK_NOT_ACCEPTED"
  | "TOOL_RATE_LIMITED"
  | "TOOL_SANDBOX_REQUIRED"
  | "PROVIDER_UNAVAILABLE"
  | "COST_LIMIT_EXCEEDED"
  | "INVALID_INPUT"
  | "AGENT_NOT_FOUND"
  | "WORKFLOW_NOT_FOUND"
  | "STEP_FAILED"
  | "REPLAY_SOURCE_NOT_FOUND";

export class RuntimeError extends Error {
  readonly code: RuntimeErrorCode;
  readonly retryable: boolean;

  constructor(code: RuntimeErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
    this.retryable = retryable;
  }
}

// ── Timeout model ─────────────────────────────────────────

export interface TimeoutConfig {
  run_timeout_ms: number;
  step_timeout_ms: number;
  tool_timeout_ms: number;
  llm_timeout_ms: number;
}

export const DEFAULT_TIMEOUTS: TimeoutConfig = {
  run_timeout_ms: 300_000,    // 5 min
  step_timeout_ms: 120_000,   // 2 min
  tool_timeout_ms: 30_000,    // 30s
  llm_timeout_ms: 60_000,     // 1 min
};

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new RuntimeError("TIMEOUT", `${label} timed out after ${ms}ms`)),
      ms,
    );
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

// ── Retry model ───────────────────────────────────────────

export interface RetryPolicy {
  max_retries: number;
  backoff_ms: number;
  backoff_multiplier: number;
}

export const DEFAULT_RETRY: RetryPolicy = {
  max_retries: 0,
  backoff_ms: 1000,
  backoff_multiplier: 2,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy,
  label: string,
): Promise<T> {
  let attempt = 0;
  let delay = policy.backoff_ms;

  while (true) {
    try {
      return await fn();
    } catch (e) {
      attempt++;
      const isRetryable = e instanceof RuntimeError ? e.retryable : false;

      if (!isRetryable || attempt > policy.max_retries) {
        if (attempt > policy.max_retries && policy.max_retries > 0) {
          throw new RuntimeError(
            "MAX_RETRIES_EXCEEDED",
            `${label} failed after ${attempt} attempts: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        throw e;
      }

      await new Promise((r) => setTimeout(r, delay));
      delay *= policy.backoff_multiplier;
    }
  }
}

// ── Standardized trace payload ────────────────────────────

export interface TracePayload {
  kind: string;
  status: TraceStatus;
  step_index: number;
  name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_ms: number;
  model_used: string | null;
  started_at: string;
  finished_at: string;
}

// ── Run event model ───────────────────────────────────────

export type RunEventKind =
  | "run:started"
  | "run:completed"
  | "run:failed"
  | "run:timeout"
  | "run:cancelled"
  | "trace:started"
  | "trace:completed"
  | "trace:failed"
  | "trace:timeout"
  | "retry:attempt"
  | "cost:warning"
  | "tool:kill_switch";

export interface RunEvent {
  kind: RunEventKind;
  run_id: string;
  trace_id?: string;
  timestamp: string;
  data: Record<string, unknown>;
}
