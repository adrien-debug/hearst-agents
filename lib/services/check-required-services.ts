/**
 * checkRequiredServices — server-side service gate.
 *
 * Verifies actual token-store records BEFORE any connector is called.
 * This is the authoritative check, independent of what the frontend reports.
 *
 * Usage:
 *   const check = await checkRequiredServices("summarize_emails", userId);
 *   if (!check.ok) return blocked(check.missing);
 */

import { getTokens } from "@/lib/token-store";

/* ─── Types ─── */

export interface ServiceCheckResult {
  ok: boolean;
  /** Logical service ids that are missing/disconnected. */
  missing: string[];
}

/* ─── Intent → required services ─── */

/**
 * Maps named intents to the logical services they require.
 * Add new entries here when new connectors are added.
 */
const INTENT_SERVICES: Record<string, string[]> = {
  summarize_emails:  ["gmail"],
  reply_urgent:      ["gmail"],
  inbox_summary:     ["gmail"],
  slack_messages:    ["slack"],
  slack_summary:     ["slack"],
  calendar_events:   ["google_calendar"],
  calendar_summary:  ["google_calendar"],
  drive_files:       ["google_drive"],
  drive_summary:     ["google_drive"],
};

/* ─── Service → token-store provider ─── */

/**
 * Maps logical service ids to the provider name used in token-store.
 * All Google services share a single "google" OAuth token.
 */
const SERVICE_TO_PROVIDER: Record<string, string> = {
  gmail:           "google",
  google_calendar: "google",
  google_drive:    "google",
  slack:           "slack",
};

/* ─── Human labels (for UX messages) ─── */

const SERVICE_LABEL: Record<string, string> = {
  gmail:           "Gmail",
  google_calendar: "Google Calendar",
  google_drive:    "Google Drive",
  slack:           "Slack",
};

export function serviceLabel(service: string): string {
  return SERVICE_LABEL[service] ?? service;
}

/* ─── Main check ─── */

/**
 * Verify that all services required by `intent` have a valid token
 * for `userId` in the token-store.
 *
 * A service is considered connected if its access token is non-null.
 * (Revoked tokens return null via getTokens — already handled by token-store.)
 *
 * @param intent - Named intent key (e.g. "summarize_emails")
 * @param userId - Authenticated user id
 */
export async function checkRequiredServices(
  intent: string,
  userId: string,
): Promise<ServiceCheckResult> {
  const required = INTENT_SERVICES[intent] ?? [];
  if (required.length === 0) return { ok: true, missing: [] };

  // Deduplicate providers to avoid redundant DB reads
  // (gmail + google_calendar both map to "google" — one read)
  const providerToServices = new Map<string, string[]>();
  for (const service of required) {
    const provider = SERVICE_TO_PROVIDER[service] ?? service;
    if (!providerToServices.has(provider)) providerToServices.set(provider, []);
    providerToServices.get(provider)!.push(service);
  }

  const missing: string[] = [];

  await Promise.all(
    [...providerToServices.entries()].map(async ([provider, services]) => {
      try {
        const tokens = await getTokens(userId, provider);
        if (!tokens.accessToken) {
          missing.push(...services);
        }
      } catch {
        // Token read failed → treat as disconnected
        missing.push(...services);
      }
    }),
  );

  console.log(
    `[Services] checkRequiredServices intent=${intent} required=[${required}] missing=[${missing}]`,
  );

  return { ok: missing.length === 0, missing };
}

/* ─── UX message builder ─── */

/**
 * Build a short, actionable blocked message for the user.
 * Format: "Gmail non connecté.\n\n[Connecter](/apps)"
 */
export function buildBlockedMessage(missing: string[]): string {
  if (missing.length === 0) return "";
  const labels = missing.map(serviceLabel);
  const names =
    labels.length === 1
      ? labels[0]
      : labels.slice(0, -1).join(", ") + " et " + labels[labels.length - 1];
  const verb = missing.length === 1 ? "non connecté" : "non connectés";
  return `${names} ${verb}.\n\n[Connecter](/apps)`;
}
