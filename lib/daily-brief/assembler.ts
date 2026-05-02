/**
 * Daily Brief assembler — fetch les 5 sources en parallèle (fail-soft).
 *
 * Les helpers natifs (Gmail, Calendar) sont préférés quand l'utilisateur a
 * connecté Google via NextAuth — on évite Composio pour ces deux sources
 * (latence + quota). Slack / GitHub / Linear passent par Composio.
 *
 * Toutes les sources sont protégées par try/catch : un fetch qui échoue
 * laisse une trace dans `sources[]` (suffixé `:error`) mais ne casse pas
 * l'assemblage. Le narrator écrira un brief même partiel.
 */

import { getRecentEmails } from "@/lib/connectors/google/gmail";
import { getTodayEvents } from "@/lib/connectors/google/calendar";
import { executeComposioAction } from "@/lib/connectors/composio/client";
import { listConnections } from "@/lib/connectors/composio/connections";
import {
  EXTRAS_PROVIDERS,
  isReservedToolkit,
  type ExtraSource,
} from "./extras-providers";
import type {
  DailyBriefCalendarItem,
  DailyBriefData,
  DailyBriefEmailItem,
  DailyBriefGithubItem,
  DailyBriefLinearItem,
  DailyBriefSlackItem,
} from "./types";

// ── Helpers ──────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function unwrapList<T = unknown>(raw: unknown): T[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as T[];
  const obj = raw as {
    data?: unknown;
    items?: unknown;
    results?: unknown;
    response_data?: unknown;
    issues?: unknown;
    pulls?: unknown;
    pull_requests?: unknown;
    messages?: unknown;
  };
  if (Array.isArray(obj.data)) return obj.data as T[];
  if (Array.isArray(obj.items)) return obj.items as T[];
  if (Array.isArray(obj.results)) return obj.results as T[];
  if (Array.isArray(obj.issues)) return obj.issues as T[];
  if (Array.isArray(obj.pulls)) return obj.pulls as T[];
  if (Array.isArray(obj.pull_requests)) return obj.pull_requests as T[];
  if (Array.isArray(obj.messages)) return obj.messages as T[];
  if (obj.response_data) return unwrapList<T>(obj.response_data);
  return [];
}

// ── Gmail (24h) ──────────────────────────────────────────────

async function fetchEmails(userId: string, limit: number): Promise<DailyBriefEmailItem[]> {
  const raw = await getRecentEmails(userId, limit);
  // getRecentEmails retourne emails inbox (pas filtrés sur les 24h côté API).
  // On filtre en post-process ici : on garde uniquement ce qui a été reçu
  // dans les 36 dernières heures (généreux pour couvrir la nuit + AM).
  const cutoff = Date.now() - 36 * 3600_000;
  return raw
    .map((m) => ({
      id: m.id,
      subject: m.subject,
      sender: m.sender,
      snippet: m.snippet,
      receivedAt: m.date,
      isRead: m.isRead,
    }))
    .filter((m) => {
      const t = Date.parse(m.receivedAt);
      return Number.isFinite(t) ? t > cutoff : true;
    });
}

// ── Calendar (today) ─────────────────────────────────────────

async function fetchCalendar(userId: string, limit: number): Promise<DailyBriefCalendarItem[]> {
  const events = await getTodayEvents(userId, limit);
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    startTime: e.startTime,
    endTime: e.endTime,
    isAllDay: e.isAllDay,
    attendees: e.attendees ?? [],
    location: e.location ?? null,
  }));
}

// ── Slack (DMs + recent, 4h window) ──────────────────────────

interface RawSlackMessage {
  channel?: string;
  text?: string;
  ts?: string;
  user?: string;
}

async function fetchSlack(userId: string, limit: number): Promise<DailyBriefSlackItem[]> {
  const since = Math.floor((Date.now() - 4 * 3600_000) / 1000);
  const result = await executeComposioAction({
    action: "SLACK_LIST_MESSAGES",
    entityId: userId,
    params: { oldest: String(since), limit },
  });
  if (!result.ok) return [];
  const messages = unwrapList<RawSlackMessage>(result.data);
  return messages
    .filter((m): m is { channel: string; text: string; ts: string; user?: string } =>
      typeof m.channel === "string" &&
      typeof m.text === "string" &&
      typeof m.ts === "string",
    )
    .slice(0, limit)
    .map((m, idx) => ({
      id: `${m.ts}:${idx}`,
      channel: m.channel,
      user: m.user ?? "unknown",
      text: m.text,
      ts: m.ts,
    }));
}

// ── GitHub PRs (recent open) ─────────────────────────────────

interface RawGithubPull {
  id?: number | string;
  number?: number;
  title?: string;
  state?: string;
  draft?: boolean;
  merged_at?: string | null;
  user?: { login?: string } | string;
  head?: { repo?: { full_name?: string } } | null;
  base?: { repo?: { full_name?: string } } | null;
  repository_url?: string;
  html_url?: string;
  updated_at?: string;
}

async function fetchGithub(userId: string, limit: number): Promise<DailyBriefGithubItem[]> {
  const result = await executeComposioAction({
    action: "GITHUB_LIST_PULLS",
    entityId: userId,
    params: { state: "open", per_page: limit, sort: "updated", direction: "desc" },
  });
  if (!result.ok) return [];
  const pulls = unwrapList<RawGithubPull>(result.data).slice(0, limit);
  return pulls
    .map((p) => {
      const repo =
        p.head?.repo?.full_name ??
        p.base?.repo?.full_name ??
        (p.repository_url ? p.repository_url.split("/").slice(-2).join("/") : "");
      const author =
        typeof p.user === "object" && p.user
          ? p.user.login ?? "unknown"
          : typeof p.user === "string"
            ? p.user
            : "unknown";
      const state: DailyBriefGithubItem["state"] = p.merged_at
        ? "merged"
        : p.draft
          ? "draft"
          : p.state === "open" || p.state === "closed"
            ? p.state
            : "unknown";
      return {
        id: String(p.id ?? p.number ?? Math.random()),
        number: typeof p.number === "number" ? p.number : 0,
        title: p.title ?? "(sans titre)",
        state,
        repo: repo || "?",
        author,
        url: p.html_url ?? "",
        updatedAt: p.updated_at ?? null,
      };
    })
    .filter((p) => p.title && p.title !== "(sans titre)");
}

// ── Linear issues (recent active) ────────────────────────────

interface RawLinearIssue {
  id?: string;
  identifier?: string;
  title?: string;
  priority?: number;
  state?: { name?: string } | string;
  assignee?: { name?: string } | string | null;
  url?: string;
  updatedAt?: string;
}

async function fetchLinear(userId: string, limit: number): Promise<DailyBriefLinearItem[]> {
  const result = await executeComposioAction({
    action: "LINEAR_LIST_ISSUES",
    entityId: userId,
    params: { limit },
  });
  if (!result.ok) return [];
  const issues = unwrapList<RawLinearIssue>(result.data).slice(0, limit);
  return issues
    .map((i) => {
      const stateName =
        typeof i.state === "object" && i.state ? i.state.name ?? "" : typeof i.state === "string" ? i.state : "";
      const assigneeName =
        typeof i.assignee === "object" && i.assignee
          ? i.assignee.name ?? null
          : typeof i.assignee === "string"
            ? i.assignee
            : null;
      return {
        id: i.id ?? i.identifier ?? Math.random().toString(),
        identifier: i.identifier ?? "?",
        title: i.title ?? "(sans titre)",
        state: stateName || "unknown",
        priority: typeof i.priority === "number" ? i.priority : null,
        assignee: assigneeName,
        url: i.url ?? null,
        updatedAt: i.updatedAt ?? null,
      };
    })
    .filter((i) => i.title && i.title !== "(sans titre)");
}

// ── Extras dynamiques (Notion, Jira, HubSpot, etc.) ───────────

async function fetchExtras(userId: string, perSourceLimit: number): Promise<ExtraSource[]> {
  const connections = await listConnections(userId, { includeInactive: false });
  const candidates = connections.filter(
    (c) => c.status === "ACTIVE" && !isReservedToolkit(c.appName),
  );

  const tasks = candidates
    .map((c) => {
      const provider = EXTRAS_PROVIDERS[c.appName.toLowerCase()];
      return provider ? { provider, conn: c } : null;
    })
    .filter((x): x is { provider: (typeof EXTRAS_PROVIDERS)[string]; conn: (typeof connections)[number] } => x !== null);

  if (tasks.length === 0) return [];

  const results = await Promise.allSettled(
    tasks.map(async (t) => {
      const items = await t.provider.fetch(userId, perSourceLimit);
      return { toolkit: t.provider.toolkit, label: t.provider.label, items };
    }),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<ExtraSource> => r.status === "fulfilled")
    .map((r) => r.value);
}

// ── Public API ───────────────────────────────────────────────

export interface AssembleDailyBriefOpts {
  userId: string;
  tenantId: string;
  /** Caps optionnels. Defaults : 20 emails / 10 cal / 10 slack / 15 PRs / 15 issues. */
  gmailLimit?: number;
  calendarLimit?: number;
  slackLimit?: number;
  githubLimit?: number;
  linearLimit?: number;
  /** ISO YYYY-MM-DD — défaut aujourd'hui. */
  targetDate?: string;
}

/**
 * Assemble les 5 sources en parallèle. Aucune des promesses ne throw upstream :
 * chaque source qui plante est marquée dans `sources[]` avec suffixe `:error`.
 *
 * Pourquoi `Promise.allSettled` plutôt que `Promise.all` : un user qui a
 * connecté Gmail mais pas Slack ne doit pas voir son brief échouer. Chaque
 * source contribue ce qu'elle peut.
 */
export async function assembleDailyBriefData(
  opts: AssembleDailyBriefOpts,
): Promise<DailyBriefData> {
  const gmailLimit = opts.gmailLimit ?? 20;
  const calendarLimit = opts.calendarLimit ?? 10;
  const slackLimit = opts.slackLimit ?? 10;
  const githubLimit = opts.githubLimit ?? 15;
  const linearLimit = opts.linearLimit ?? 15;

  const [emailsRes, calendarRes, slackRes, githubRes, linearRes, extrasRes] = await Promise.allSettled([
    fetchEmails(opts.userId, gmailLimit),
    fetchCalendar(opts.userId, calendarLimit),
    fetchSlack(opts.userId, slackLimit),
    fetchGithub(opts.userId, githubLimit),
    fetchLinear(opts.userId, linearLimit),
    fetchExtras(opts.userId, 10),
  ]);

  const sources: string[] = [];
  const emails =
    emailsRes.status === "fulfilled"
      ? (sources.push(emailsRes.value.length > 0 ? "gmail" : "gmail:empty"), emailsRes.value)
      : (sources.push("gmail:error"), [] as DailyBriefEmailItem[]);
  const calendar =
    calendarRes.status === "fulfilled"
      ? (sources.push(calendarRes.value.length > 0 ? "calendar" : "calendar:empty"), calendarRes.value)
      : (sources.push("calendar:error"), [] as DailyBriefCalendarItem[]);
  const slack =
    slackRes.status === "fulfilled"
      ? (sources.push(slackRes.value.length > 0 ? "slack" : "slack:empty"), slackRes.value)
      : (sources.push("slack:error"), [] as DailyBriefSlackItem[]);
  const github =
    githubRes.status === "fulfilled"
      ? (sources.push(githubRes.value.length > 0 ? "github" : "github:empty"), githubRes.value)
      : (sources.push("github:error"), [] as DailyBriefGithubItem[]);
  const linear =
    linearRes.status === "fulfilled"
      ? (sources.push(linearRes.value.length > 0 ? "linear" : "linear:empty"), linearRes.value)
      : (sources.push("linear:error"), [] as DailyBriefLinearItem[]);

  const extras: ExtraSource[] = extrasRes.status === "fulfilled" ? extrasRes.value : [];
  for (const ex of extras) {
    sources.push(ex.items.length > 0 ? ex.toolkit : `${ex.toolkit}:empty`);
  }
  if (extrasRes.status === "rejected") {
    sources.push("extras:error");
  }

  return {
    emails,
    calendar,
    slack,
    github,
    linear,
    extras,
    sources,
    generatedAt: Date.now(),
    targetDate: opts.targetDate ?? todayIso(),
  };
}
