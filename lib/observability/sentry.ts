/**
 * Sentry helpers — branchés sur SENTRY_DSN.
 * No-op si la var d'environnement est absente.
 */

import * as Sentry from "@sentry/nextjs";

export const isSentryEnabled = (): boolean =>
  Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!isSentryEnabled()) return;
  Sentry.captureException(error, { extra: context });
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = "info"): void {
  if (!isSentryEnabled()) return;
  Sentry.captureMessage(message, level);
}

export function setUser(user: { id: string; email?: string }): void {
  if (!isSentryEnabled()) return;
  Sentry.setUser(user);
}

export function clearUser(): void {
  if (!isSentryEnabled()) return;
  Sentry.setUser(null);
}
