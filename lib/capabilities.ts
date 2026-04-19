/**
 * Capability Layer — Maps intents to capabilities, capabilities to providers.
 *
 * This is the abstraction that decouples "what the user wants" from
 * "which provider handles it". Adding a new provider means adding
 * one entry to CAPABILITY_PROVIDERS, not modifying 7 files.
 */

import { getTokens } from "@/lib/token-store";

export type Capability = "messaging" | "calendar" | "files";

/**
 * Intent → Capability.
 * Every named intent maps to exactly one capability.
 */
export const INTENT_CAPABILITY: Record<string, Capability> = {
  summarize_emails: "messaging",
  inbox_summary: "messaging",
  reply_urgent: "messaging",
  slack_messages: "messaging",
  slack_summary: "messaging",

  calendar_events: "calendar",
  calendar_summary: "calendar",

  drive_files: "files",
  drive_summary: "files",
};

/**
 * Capability → all possible providers (ordered by priority).
 * To add Outlook, just append "outlook" to messaging.
 */
export const CAPABILITY_PROVIDERS: Record<Capability, string[]> = {
  messaging: ["gmail", "slack"],
  calendar: ["google_calendar"],
  files: ["google_drive"],
};

/**
 * Provider → token-store key.
 * Multiple logical providers can share one OAuth token.
 */
export const PROVIDER_TO_TOKEN: Record<string, string> = {
  gmail: "google",
  google_calendar: "google",
  google_drive: "google",
  slack: "slack",
};

/**
 * Human-readable labels for capabilities (used in blocked messages).
 */
export const CAPABILITY_LABEL: Record<Capability, string> = {
  messaging: "Messagerie (Gmail ou Slack)",
  calendar: "Agenda",
  files: "Fichiers",
};

/**
 * Resolve which providers are actually connected for a given capability.
 * Returns only providers with a valid token.
 */
export async function resolveProviders(
  capability: Capability,
  userId: string,
): Promise<string[]> {
  const allProviders = CAPABILITY_PROVIDERS[capability] ?? [];
  const connected: string[] = [];

  await Promise.all(
    allProviders.map(async (provider) => {
      const tokenKey = PROVIDER_TO_TOKEN[provider] ?? provider;
      try {
        const tokens = await getTokens(userId, tokenKey);
        if (tokens.accessToken) {
          connected.push(provider);
        }
      } catch {
        // Token read failed → not connected
      }
    }),
  );

  console.log(
    `[Capabilities] resolve ${capability} → candidates=[${allProviders}] connected=[${connected}]`,
  );

  return connected;
}

/**
 * Quick check: is at least one provider connected for this capability?
 */
export async function hasCapability(
  capability: Capability,
  userId: string,
): Promise<boolean> {
  const providers = await resolveProviders(capability, userId);
  return providers.length > 0;
}

