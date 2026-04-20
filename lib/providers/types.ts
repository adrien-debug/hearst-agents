/**
 * Provider Registry — Canonical types.
 *
 * Single source of truth for what a "provider" is across HEARST OS.
 * Every provider mapping in the system should derive from these definitions.
 */

import type { ConnectorCapability } from "@/lib/connectors/platform/types";

/**
 * Strict union of all known provider identifiers.
 * Adding a new provider = adding it here AND in registry.ts.
 */
export type ProviderId =
  | "google"
  | "slack"
  | "web"
  | "anthropic_managed"
  | "notion"
  | "github"
  | "stripe"
  | "jira"
  | "hubspot"
  | "airtable"
  | "figma"
  | "zapier"
  | "system";

export interface ProviderDefinition {
  id: ProviderId;
  label: string;

  capabilities: ConnectorCapability[];

  tools: string[];

  ui: {
    initial: string;
    color: string;
  };

  auth: {
    tokenBucket: string;
    connectable: boolean;
  };

  keywords: {
    fr: string[];
    en: string[];
  };

  blockedMessage: string;

  /** Static priority for scoring (higher = preferred). Default 1. */
  priority: number;
}

/**
 * Checks if a string is a valid ProviderId.
 * Use at runtime boundaries (API inputs, DB reads) where types can't guarantee safety.
 */
export function isProviderId(value: string): value is ProviderId {
  return PROVIDER_ID_SET.has(value as ProviderId);
}

const PROVIDER_ID_SET = new Set<ProviderId>([
  "google", "slack", "web", "anthropic_managed", "notion",
  "github", "stripe", "jira", "hubspot", "airtable",
  "figma", "zapier", "system",
]);
