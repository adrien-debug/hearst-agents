/**
 * Connector Platform — canonical registry.
 *
 * Seed registry for current and near-priority services.
 * Future connector expansion uses this single model.
 */

import type { ConnectorDefinition } from "./types";

const connectors: Map<string, ConnectorDefinition> = new Map();

function registerConnector(def: ConnectorDefinition): void {
  connectors.set(def.id, def);
}

export function getConnector(id: string): ConnectorDefinition | undefined {
  return connectors.get(id);
}

// ── Seed registry ────────────────────────────────────────────

const SEED: ConnectorDefinition[] = [
  { id: "google", label: "Google Workspace", provider: "google", capabilities: ["messaging", "calendar", "files"], authType: "oauth", isExternal: true, status: "active" },
  { id: "slack", label: "Slack", provider: "slack", capabilities: ["messaging"], authType: "oauth", isExternal: true, status: "active" },
  { id: "web", label: "Web Search", provider: "web", capabilities: ["research"], authType: "api_key", isExternal: true, status: "active" },
  { id: "anthropic_managed", label: "Anthropic Managed Agent", provider: "anthropic", capabilities: ["research", "automation"], authType: "api_key", isExternal: true, status: "active" },
  { id: "notion", label: "Notion", provider: "notion", capabilities: ["files", "automation"], authType: "oauth", isExternal: true, status: "beta" },
  { id: "github", label: "GitHub", provider: "github", capabilities: ["developer_tools"], authType: "oauth", isExternal: true, status: "beta" },
  { id: "stripe", label: "Stripe", provider: "stripe", capabilities: ["finance", "commerce"], authType: "api_key", isExternal: true, status: "planned" },
  { id: "jira", label: "Jira", provider: "atlassian", capabilities: ["developer_tools"], authType: "oauth", isExternal: true, status: "planned" },
  { id: "hubspot", label: "HubSpot", provider: "hubspot", capabilities: ["crm"], authType: "oauth", isExternal: true, status: "planned" },
  { id: "airtable", label: "Airtable", provider: "airtable", capabilities: ["files", "automation"], authType: "api_key", isExternal: true, status: "planned" },
  { id: "figma", label: "Figma", provider: "figma", capabilities: ["design"], authType: "oauth", isExternal: true, status: "planned" },
  { id: "zapier", label: "Zapier", provider: "zapier", capabilities: ["automation"], authType: "oauth", isExternal: true, status: "planned" },
];

for (const def of SEED) {
  registerConnector(def);
}
