/**
 * Capability Layer — Maps intents to capabilities, capabilities to providers.
 *
 * Delegates provider knowledge to the canonical Provider Registry.
 * This file keeps the intent→capability mapping (domain-specific)
 * and the runtime resolution functions (token-dependent).
 */

import { getTokens } from "@/lib/token-store";
import {
  getProvidersByCapability,
  getProviderTokenBucket,
} from "@/lib/providers/registry";
import type { ConnectorCapability } from "@/lib/connectors/platform/types";

export type Capability = ConnectorCapability;

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

  send_message: "messaging_send",
  reply_message: "messaging_send",
  forward_message: "messaging_send",
};

/**
 * Capability → all possible providers (ordered by priority).
 * Now derived from the Provider Registry.
 */
export function getCapabilityProviders(capability: Capability): string[] {
  return getProvidersByCapability(capability).map((p) => p.id);
}

/** @deprecated Use getCapabilityProviders() instead */
export const CAPABILITY_PROVIDERS: Record<string, string[]> = {
  messaging: ["gmail", "slack"],
  calendar: ["google_calendar"],
  files: ["google_drive"],
};

/**
 * Provider → token-store key.
 * Now derived from the Provider Registry.
 */
export function getTokenBucket(provider: string): string {
  return getProviderTokenBucket(provider);
}

/** @deprecated Use getTokenBucket() instead */
export const PROVIDER_TO_TOKEN: Record<string, string> = {
  gmail: "google",
  google_calendar: "google",
  google_drive: "google",
  slack: "slack",
};

/**
 * Human-readable labels for capabilities (used in blocked messages).
 */
export const CAPABILITY_LABEL: Record<string, string> = {
  messaging: "Messagerie (Gmail, Slack ou WhatsApp)",
  messaging_send: "Envoi de messages",
  calendar: "Agenda",
  files: "Fichiers",
  research: "Recherche",
  crm: "CRM",
  finance: "Finance",
  support: "Support",
  design: "Design",
  commerce: "Commerce",
  developer_tools: "Outils développeur",
  automation: "Automatisation",
};

/**
 * Resolve which providers are actually connected for a given capability.
 * Returns only providers with a valid token.
 */
export async function resolveProviders(
  capability: Capability,
  userId: string,
): Promise<string[]> {
  const registryProviders = getProvidersByCapability(capability);
  const connected: string[] = [];

  await Promise.all(
    registryProviders.map(async (provider) => {
      try {
        const tokens = await getTokens(userId, provider.auth.tokenBucket);
        if (tokens.accessToken) {
          connected.push(provider.id);
        }
      } catch {
        // Token read failed → not connected
      }
    }),
  );

  console.log(
    `[Capabilities] resolve ${capability} → candidates=[${registryProviders.map((p) => p.id)}] connected=[${connected}]`,
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
