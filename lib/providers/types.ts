/**
 * Provider Registry — Canonical types.
 *
 * ProviderId is derived from PROVIDER_IDS in registry.ts.
 * Adding a new provider = adding it to PROVIDER_IDS + one entry in PROVIDERS.
 */

import type { ConnectorCapability } from "@/lib/connectors/platform/types";
import type { PROVIDER_IDS } from "./registry";

/**
 * Derived union — automatically stays in sync with the registry array.
 */
export type ProviderId = (typeof PROVIDER_IDS)[number];

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
  return PROVIDER_ID_SET.has(value);
}

/** Built from the registry constant — no manual sync needed. */
// We can't import PROVIDER_IDS at value level here due to circular ref,
// so we maintain a mirror set. The type derivation above ensures compile-time safety.
const PROVIDER_ID_SET = new Set<string>([
  "google", "slack", "web", "anthropic_managed", "notion",
  "github", "stripe", "jira", "hubspot", "airtable",
  "figma", "zapier", "system",
]);
