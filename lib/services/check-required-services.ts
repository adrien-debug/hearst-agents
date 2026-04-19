/**
 * checkRequiredServices — server-side service gate (capability-based).
 *
 * Verifies that at least one provider is connected for the capability
 * required by the given intent. Uses the capability layer for resolution.
 *
 * Usage:
 *   const check = await checkRequiredServices("summarize_emails", userId);
 *   if (!check.ok) return blocked(check.missing);
 */

import {
  INTENT_CAPABILITY,
  CAPABILITY_LABEL,
  resolveProviders,
  type Capability,
} from "@/lib/capabilities";

export interface ServiceCheckResult {
  ok: boolean;
  /** Capability or service ids that are missing/disconnected. */
  missing: string[];
  /** Providers that are connected for this capability (empty if none). */
  connectedProviders: string[];
}

/**
 * Verify that at least one provider for the capability required by `intent`
 * has a valid token for `userId`.
 *
 * Unlike the old implementation that required ALL listed providers,
 * this checks that ANY provider for the capability is connected.
 * "résume mes messages" works with Gmail only, Slack only, or both.
 */
export async function checkRequiredServices(
  intent: string,
  userId: string,
): Promise<ServiceCheckResult> {
  const capability = INTENT_CAPABILITY[intent];
  if (!capability) {
    return { ok: true, missing: [], connectedProviders: [] };
  }

  const connected = await resolveProviders(capability, userId);

  console.log(
    `[Services] checkRequiredServices intent=${intent} capability=${capability} connected=[${connected}]`,
  );

  if (connected.length > 0) {
    return { ok: true, missing: [], connectedProviders: connected };
  }

  return { ok: false, missing: [capability], connectedProviders: [] };
}

/**
 * Build a short, actionable blocked message for the user.
 * Now works with capability names instead of raw provider names.
 */
export function buildBlockedMessage(missing: string[]): string {
  if (missing.length === 0) return "";

  const labels = missing.map(
    (m) => CAPABILITY_LABEL[m as Capability] ?? m,
  );
  const names =
    labels.length === 1
      ? labels[0]
      : labels.slice(0, -1).join(", ") + " et " + labels[labels.length - 1];

  return `${names} non connecté(e). Connecte un service dans Applications.\n\n[Connecter](/apps)`;
}
