/**
 * Provider Registry — Single source of truth.
 *
 * To add a new provider:
 *   1. Add its id to ProviderId union in types.ts
 *   2. Add ONE entry to PROVIDERS below
 */

import type { ConnectorCapability } from "@/lib/connectors/platform/types";
import type { ProviderDefinition, ProviderId } from "./types";

/**
 * Canonical list of provider IDs — single source of truth.
 * ProviderId type in types.ts is derived from this array.
 */
export const PROVIDER_IDS = [
  "google", "slack", "whatsapp", "web", "anthropic_managed", "notion",
  "github", "stripe", "jira", "hubspot", "airtable",
  "figma", "zapier", "system",
] as const;

const PROVIDERS: ProviderDefinition[] = [
  {
    id: "google",
    label: "Google",
    capabilities: ["messaging", "calendar", "files"],
    tools: ["get_messages", "get_calendar_events", "get_files"],
    ui: { initial: "G", color: "border-blue-400/40 text-blue-400" },
    auth: { tokenBucket: "google", connectable: true },
    keywords: {
      fr: [
        "email", "emails", "mail", "mails", "boîte", "boite", "courrier",
        "agenda", "calendrier", "réunion", "reunion", "événement", "evenement",
        "planning", "rendez-vous", "rdv",
        "fichier", "fichiers", "document", "documents", "drive", "dossier",
      ],
      en: [
        "email", "emails", "mail", "inbox",
        "calendar", "meeting", "event", "schedule",
        "file", "files", "document", "documents", "drive", "folder",
      ],
    },
    blockedMessage: "Google n'est pas connecté. Connectez votre compte Google dans Applications.",
    priority: 10,
  },
  {
    id: "slack",
    label: "Slack",
    capabilities: ["messaging", "messaging_send"],
    tools: ["post_message", "send_message"],
    ui: { initial: "S", color: "border-purple-400/40 text-purple-400" },
    auth: { tokenBucket: "slack", connectable: true },
    keywords: {
      fr: ["slack", "message", "messages"],
      en: ["slack", "message", "messages"],
    },
    blockedMessage: "Slack n'est pas connecté. Connectez Slack dans Applications.",
    priority: 8,
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    capabilities: ["messaging", "messaging_send"],
    tools: ["send_message"],
    ui: { initial: "WA", color: "border-emerald-400/40 text-emerald-400" },
    auth: { tokenBucket: "whatsapp", connectable: true },
    keywords: {
      fr: ["whatsapp", "wa", "message", "messages"],
      en: ["whatsapp", "wa", "message", "messages"],
    },
    blockedMessage: "WhatsApp n'est pas connecté.",
    priority: 7,
  },
  {
    id: "web",
    label: "Web",
    capabilities: ["research"],
    tools: ["search_web"],
    ui: { initial: "W", color: "border-zinc-300/40 text-zinc-300" },
    auth: { tokenBucket: "web", connectable: false },
    keywords: { fr: [], en: [] },
    blockedMessage: "",
    priority: 5,
  },
  {
    id: "anthropic_managed",
    label: "Anthropic",
    capabilities: ["research", "automation"],
    tools: [],
    ui: { initial: "A", color: "border-amber-400/40 text-amber-400" },
    auth: { tokenBucket: "anthropic_managed", connectable: false },
    keywords: { fr: [], en: [] },
    blockedMessage: "",
    priority: 5,
  },
  {
    id: "notion",
    label: "Notion",
    capabilities: ["files", "automation"],
    tools: ["query_database"],
    ui: { initial: "N", color: "border-zinc-300/40 text-zinc-300" },
    auth: { tokenBucket: "notion", connectable: false },
    keywords: { fr: [], en: [] },
    blockedMessage: "",
    priority: 5,
  },
  {
    id: "github",
    label: "GitHub",
    capabilities: ["developer_tools"],
    tools: [],
    ui: { initial: "GH", color: "border-zinc-300/40 text-zinc-300" },
    auth: { tokenBucket: "github", connectable: false },
    keywords: { fr: [], en: [] },
    blockedMessage: "",
    priority: 5,
  },
  {
    id: "stripe",
    label: "Stripe",
    capabilities: ["finance", "commerce"],
    tools: [],
    ui: { initial: "St", color: "border-violet-400/40 text-violet-400" },
    auth: { tokenBucket: "stripe", connectable: false },
    keywords: { fr: [], en: [] },
    blockedMessage: "",
    priority: 5,
  },
  {
    id: "jira",
    label: "Jira",
    capabilities: ["developer_tools"],
    tools: [],
    ui: { initial: "J", color: "border-blue-400/40 text-blue-400" },
    auth: { tokenBucket: "atlassian", connectable: false },
    keywords: { fr: [], en: [] },
    blockedMessage: "",
    priority: 5,
  },
  {
    id: "hubspot",
    label: "HubSpot",
    capabilities: ["crm"],
    tools: [],
    ui: { initial: "H", color: "border-orange-400/40 text-orange-400" },
    auth: { tokenBucket: "hubspot", connectable: false },
    keywords: { fr: [], en: [] },
    blockedMessage: "",
    priority: 5,
  },
  {
    id: "airtable",
    label: "Airtable",
    capabilities: ["files", "automation"],
    tools: [],
    ui: { initial: "AT", color: "border-teal-400/40 text-teal-400" },
    auth: { tokenBucket: "airtable", connectable: false },
    keywords: { fr: [], en: [] },
    blockedMessage: "",
    priority: 5,
  },
  {
    id: "figma",
    label: "Figma",
    capabilities: ["design"],
    tools: [],
    ui: { initial: "F", color: "border-pink-400/40 text-pink-400" },
    auth: { tokenBucket: "figma", connectable: false },
    keywords: { fr: [], en: [] },
    blockedMessage: "",
    priority: 5,
  },
  {
    id: "zapier",
    label: "Zapier",
    capabilities: ["automation"],
    tools: [],
    ui: { initial: "Z", color: "border-orange-400/40 text-orange-400" },
    auth: { tokenBucket: "zapier", connectable: false },
    keywords: { fr: [], en: [] },
    blockedMessage: "",
    priority: 5,
  },
  {
    id: "system",
    label: "System",
    capabilities: [],
    tools: ["generate_pdf", "generate_xlsx", "generate_report", "export_excel", "analyze_data"],
    ui: { initial: "SY", color: "border-cyan-400/40 text-cyan-400" },
    auth: { tokenBucket: "system", connectable: false },
    keywords: { fr: [], en: [] },
    blockedMessage: "",
    priority: 1,
  },
];

// ── Indexes (built once at module load) ─────────────────────

const byId = new Map<ProviderId, ProviderDefinition>();
const byTool = new Map<string, ProviderDefinition>();
const byCap = new Map<ConnectorCapability, ProviderDefinition[]>();

function buildIndexes(): void {
  byId.clear();
  byTool.clear();
  byCap.clear();

  for (const p of PROVIDERS) {
    byId.set(p.id, p);

    for (const tool of p.tools) {
      byTool.set(tool, p);
    }

    for (const cap of p.capabilities) {
      const list = byCap.get(cap) ?? [];
      list.push(p);
      byCap.set(cap, list);
    }
  }
}

buildIndexes();

// ── Public API ──────────────────────────────────────────────

export function getProviderById(id: ProviderId | string): ProviderDefinition | undefined {
  return byId.get(id as ProviderId);
}

export function getProviderForTool(toolName: string): ProviderDefinition | undefined {
  return byTool.get(toolName);
}

export function getProvidersByCapability(cap: ConnectorCapability): ProviderDefinition[] {
  return byCap.get(cap) ?? [];
}

export function getAllProviders(): ProviderDefinition[] {
  return PROVIDERS;
}

export function getConnectableProviders(): Set<ProviderId> {
  const set = new Set<ProviderId>();
  for (const p of PROVIDERS) {
    if (p.auth.connectable) set.add(p.id);
  }
  return set;
}

export function getProviderLabel(id: ProviderId | string): string {
  return byId.get(id as ProviderId)?.label ?? id.charAt(0).toUpperCase() + id.slice(1);
}

export function getProviderCapabilitiesFromRegistry(id: ProviderId | string): ConnectorCapability[] {
  return byId.get(id as ProviderId)?.capabilities ?? [];
}

export function getProviderUi(id: ProviderId | string): { initial: string; color: string } {
  return byId.get(id as ProviderId)?.ui ?? { initial: id.charAt(0).toUpperCase(), color: "border-zinc-600/40 text-zinc-400" };
}

export function getProviderTokenBucket(id: ProviderId | string): string {
  return byId.get(id as ProviderId)?.auth.tokenBucket ?? id;
}
