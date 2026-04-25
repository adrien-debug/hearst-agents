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
  userHash: string; // Anonymized user identifier
  timestamp: string; // ISO 8601
  properties?: Record<string, unknown>;
}

/**
 * Log analytics event (server-side)
 *
 * Note: Replace console with your analytics backend (PostHog, Amplitude, etc.)
 * when ready for production scale.
 */
export function logAnalyticsEvent(
  type: AnalyticsEventType,
  userId: string,
  properties?: Record<string, unknown>
): void {
  // Anonymize user ID (simple hash for privacy)
  const userHash = hashUserId(userId);

  const event: AnalyticsEvent = {
    type,
    userHash,
    timestamp: new Date().toISOString(),
    properties,
  };

  // Structured log for ingestion
  console.log(`[Analytics] ${type}`, JSON.stringify(event));
}

/**
 * Simple hash for user ID anonymization
 */
function hashUserId(userId: string): string {
  // Simple non-cryptographic hash for analytics
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `user_${Math.abs(hash).toString(16)}`;
}

/**
 * Check if this is the first message for a user (activation detection)
 */
export function checkFirstMessage(userId: string, threadCount: number): boolean {
  // First message = first thread and first message in that thread
  return threadCount === 0;
}
