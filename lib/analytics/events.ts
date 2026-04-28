/**
 * Analytics Events — Structured logging for product metrics
 *
 * Architecture Finale alignment: Minimal viable analytics.
 * Logs structured events server-side for product insights.
 *
 * Events:
 * - login_success: User authenticated
 * - first_message_sent: Activation metric
 * - run_completed: Execution success
 * - run_failed: Execution failure
 */

export type AnalyticsEventType =
  | "login_success"
  | "first_message_sent"
  | "run_completed"
  | "run_failed";

export interface AnalyticsEvent {
  type: AnalyticsEventType;
  userHash: string;
  timestamp: string;
  properties?: Record<string, unknown>;
}

export function logAnalyticsEvent(
  type: AnalyticsEventType,
  userId: string,
  properties?: Record<string, unknown>
): void {
  const userHash = hashUserId(userId);

  const event: AnalyticsEvent = {
    type,
    userHash,
    timestamp: new Date().toISOString(),
    properties,
  };

  // TODO: remplacer par backend analytics (PostHog, Amplitude, etc.)
  console.info(`[Analytics] ${type}`, JSON.stringify(event));
}

function hashUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `user_${Math.abs(hash).toString(16)}`;
}
