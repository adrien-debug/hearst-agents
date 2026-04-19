/**
 * Provider → Capability mapping.
 *
 * Canonical source of what each provider can do.
 * Used to auto-populate connection capabilities on registration.
 */

import type { ConnectorCapability } from "@/lib/connectors/platform/types";

export const PROVIDER_CAPABILITIES: Record<string, ConnectorCapability[]> = {
  google: ["messaging", "calendar", "files"],
  slack: ["messaging"],
  web: ["research"],
  anthropic_managed: ["research", "automation"],
  notion: ["files", "automation"],
  github: ["developer_tools"],
  stripe: ["finance", "commerce"],
  jira: ["developer_tools"],
  hubspot: ["crm"],
  airtable: ["files", "automation"],
  figma: ["design"],
  zapier: ["automation"],
};

export function getProviderCapabilities(provider: string): ConnectorCapability[] {
  return PROVIDER_CAPABILITIES[provider] ?? [];
}
