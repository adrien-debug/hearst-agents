/**
 * Daily Brief — providers extras (apps connectées hors les 5 hardcodées).
 *
 * Pour chaque toolkit Composio connecté que l'utilisateur a lié, on définit
 * un fetcher "latest activity" qui retourne 5-10 items récents. Le brief
 * assembler les agrège en plus de Gmail/Calendar/Slack/GitHub/Linear, et le
 * narrator LLM peut les évoquer dans les sections people/decisions/signals.
 *
 * Pour ajouter un toolkit : ajoute une entrée dans `providers` avec son slug
 * Composio + le fetcher.
 */

import { executeComposioAction } from "@/lib/connectors/composio/client";

export interface ExtraSourceItem {
  id: string;
  title: string;
  subtitle?: string;
  url?: string;
  updatedAt?: string;
}

export interface ExtraSource {
  toolkit: string;
  label: string;
  items: ExtraSourceItem[];
}

interface ExtraProvider {
  /** Toolkit slug Composio (ex: "notion", "jira", "hubspot"). Matchs `connection.toolkit`. */
  toolkit: string;
  label: string;
  fetch: (userId: string, limit: number) => Promise<ExtraSourceItem[]>;
}

// Toolkits déjà gérés par les fetchers spécialisés du brief — exclus des extras.
const RESERVED_TOOLKITS = new Set([
  "gmail",
  "googlecalendar",
  "calendar",
  "googlemail",
  "slack",
  "github",
  "linear",
]);

export function isReservedToolkit(toolkit: string): boolean {
  return RESERVED_TOOLKITS.has(toolkit.toLowerCase());
}

// ── Provider fetchers ─────────────────────────────────────────────

async function fetchNotion(userId: string, limit: number): Promise<ExtraSourceItem[]> {
  const r = await executeComposioAction({
    action: "NOTION_SEARCH",
    entityId: userId,
    params: {
      query: "",
      page_size: limit,
      sort: { direction: "descending", timestamp: "last_edited_time" },
    },
  });
  if (!r.ok) return [];
  const obj = r.data as {
    results?: Array<{
      id: string;
      url?: string;
      last_edited_time?: string;
      properties?: Record<string, unknown>;
    }>;
  };
  const results = obj?.results ?? [];
  return results.slice(0, limit).map((p) => {
    const props = p.properties ?? {};
    const titleProp = Object.values(props).find((x: unknown) => {
      const o = x as { type?: string };
      return o?.type === "title";
    }) as { title?: Array<{ plain_text?: string }> } | undefined;
    const title = titleProp?.title?.[0]?.plain_text ?? "(sans titre)";
    return {
      id: p.id,
      title,
      url: p.url,
      updatedAt: p.last_edited_time,
    };
  });
}

async function fetchJira(userId: string, limit: number): Promise<ExtraSourceItem[]> {
  const r = await executeComposioAction({
    action: "JIRA_SEARCH_ISSUES_USING_JQL",
    entityId: userId,
    params: {
      jql: "assignee=currentUser() AND statusCategory != Done ORDER BY updated DESC",
      maxResults: limit,
      fields: ["summary", "status", "priority", "updated"],
    },
  });
  if (!r.ok) return [];
  const obj = r.data as {
    issues?: Array<{
      id?: string;
      key?: string;
      fields?: {
        summary?: string;
        status?: { name?: string };
        priority?: { name?: string };
        updated?: string;
      };
    }>;
  };
  const issues = obj?.issues ?? [];
  return issues.slice(0, limit).map((i) => ({
    id: i.id ?? i.key ?? Math.random().toString(),
    title: `${i.key ?? ""} ${i.fields?.summary ?? "(sans titre)"}`.trim(),
    subtitle: [i.fields?.status?.name, i.fields?.priority?.name].filter(Boolean).join(" · "),
    updatedAt: i.fields?.updated,
  }));
}

async function fetchHubspot(userId: string, limit: number): Promise<ExtraSourceItem[]> {
  const r = await executeComposioAction({
    action: "HUBSPOT_GET_ALL_DEALS",
    entityId: userId,
    params: { limit, properties: ["dealname", "dealstage", "amount", "closedate"] },
  });
  if (!r.ok) return [];
  const obj = r.data as {
    results?: Array<{
      id: string;
      properties?: {
        dealname?: string;
        dealstage?: string;
        amount?: string;
        closedate?: string;
      };
    }>;
  };
  const deals = obj?.results ?? [];
  return deals.slice(0, limit).map((d) => ({
    id: d.id,
    title: d.properties?.dealname ?? "(deal sans nom)",
    subtitle: [d.properties?.dealstage, d.properties?.amount ? `${d.properties.amount}€` : null]
      .filter(Boolean)
      .join(" · "),
    updatedAt: d.properties?.closedate,
  }));
}

async function fetchAsana(userId: string, limit: number): Promise<ExtraSourceItem[]> {
  const r = await executeComposioAction({
    action: "ASANA_USER_TASK_LIST_TASKS",
    entityId: userId,
    params: { completed_since: "now", limit },
  });
  if (!r.ok) return [];
  const obj = r.data as {
    data?: Array<{ gid: string; name?: string; due_on?: string; permalink_url?: string }>;
  };
  const tasks = obj?.data ?? [];
  return tasks.slice(0, limit).map((t) => ({
    id: t.gid,
    title: t.name ?? "(sans titre)",
    subtitle: t.due_on ? `due ${t.due_on}` : undefined,
    url: t.permalink_url,
  }));
}

async function fetchTrello(userId: string, limit: number): Promise<ExtraSourceItem[]> {
  const r = await executeComposioAction({
    action: "TRELLO_GET_MY_BOARDS_OPEN_BOARDS",
    entityId: userId,
    params: { limit },
  });
  if (!r.ok) return [];
  const boards = (r.data as Array<{ id: string; name?: string; url?: string; dateLastActivity?: string }> | null) ?? [];
  return boards.slice(0, limit).map((b) => ({
    id: b.id,
    title: b.name ?? "(board sans nom)",
    url: b.url,
    updatedAt: b.dateLastActivity,
  }));
}

// ── Registry ──────────────────────────────────────────────────────

const providers: ExtraProvider[] = [
  { toolkit: "notion", label: "Notion", fetch: fetchNotion },
  { toolkit: "jira", label: "Jira", fetch: fetchJira },
  { toolkit: "hubspot", label: "HubSpot", fetch: fetchHubspot },
  { toolkit: "asana", label: "Asana", fetch: fetchAsana },
  { toolkit: "trello", label: "Trello", fetch: fetchTrello },
];

export const EXTRAS_PROVIDERS: Record<string, ExtraProvider> = Object.fromEntries(
  providers.map((p) => [p.toolkit, p]),
);

export function getExtraProviderFor(toolkit: string): ExtraProvider | null {
  return EXTRAS_PROVIDERS[toolkit.toLowerCase()] ?? null;
}
