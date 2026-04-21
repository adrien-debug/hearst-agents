/**
 * Planner Debug / Observability — Silent by default.
 *
 * Enable: process.env.HEARST_PLANNER_DEBUG=1
 * Or at runtime: setPlannerDebug(true)
 */

let debugEnabled =
  typeof process !== "undefined" && process.env.HEARST_PLANNER_DEBUG === "1";

export function setPlannerDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

export function isPlannerDebugEnabled(): boolean {
  return debugEnabled;
}

export function logPlanEvent(
  event: string,
  detail?: Record<string, unknown>,
): void {
  if (!debugEnabled) return;
  console.log(`[Planner] ${event}`, detail ?? "");
}
