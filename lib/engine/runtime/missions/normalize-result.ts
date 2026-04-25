/**
 * Normalize Mission Result — turns raw execution outcomes into a canonical shape.
 *
 * Used by the scheduler to produce consistent ops records for both
 * in-memory and persisted state.
 */

export interface NormalizedMissionResult {
  status: "success" | "failed" | "blocked";
  message?: string;
}

const BLOCKED_PATTERNS = [
  "capability_blocked",
  "provider",
  "not_connected",
  "missing_scope",
  "auth_required",
  "disconnected",
];

export function normalizeMissionResult(
  outcome: { runId?: string | null; error?: unknown },
): NormalizedMissionResult {
  if (outcome.error) {
    const msg =
      outcome.error instanceof Error
        ? outcome.error.message
        : String(outcome.error);

    const lower = msg.toLowerCase();
    const isBlocked = BLOCKED_PATTERNS.some((p) => lower.includes(p));

    return {
      status: isBlocked ? "blocked" : "failed",
      message: msg.slice(0, 500),
    };
  }

  if (!outcome.runId) {
    return { status: "failed", message: "no run_id returned" };
  }

  return { status: "success" };
}
