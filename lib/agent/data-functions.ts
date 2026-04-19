/**
 * Agent data functions — thin wrappers around the unified layer.
 *
 * Each function returns a compact, LLM-friendly summary (not raw objects).
 * Limits are intentionally low to keep the context window lean.
 * These are designed to be called server-side by the chat route today,
 * and migrated to tool-calls (function calling) in the future.
 */

import { getUnifiedMessages, getUnifiedEvents, getUnifiedFiles } from "@/lib/connectors/unified";
import type { UnifiedMessage, UnifiedEvent, UnifiedFile } from "@/lib/connectors/unified-types";

/* ─── Limits ─── */

const MAX_MESSAGES = 5;
const MAX_EVENTS = 3;
const MAX_FILES = 3;
const PREVIEW_LENGTH = 80;

/* ─── Result types ─── */

export interface MessageSummary {
  id: string;
  source: string;
  from: string;
  subject: string;
  preview: string;
  date: string;
  unread: boolean;
  priority: "urgent" | "normal" | "low";
}

export interface EventSummary {
  id: string;
  title: string;
  day: string;
  time: string;
  location?: string;
}

export interface FileSummary {
  id: string;
  name: string;
  modified: string;
  shared: boolean;
}

export interface MessageStats {
  total: number;
  unread: number;
  urgent: number;
  slack: number;
  low: number;
}

export interface DataSnapshot {
  messages?: { items: MessageSummary[]; total: number; stats: MessageStats };
  events?: { items: EventSummary[]; total: number };
  files?: { items: FileSummary[]; total: number };
}

/* ─── Formatters (raw → summary) ─── */

function summarizeMessage(m: UnifiedMessage): MessageSummary {
  return {
    id: m.id,
    source: m.source.provider === "gmail" ? "Email" : "Slack",
    from: m.from,
    subject: m.subject,
    preview: m.preview.slice(0, PREVIEW_LENGTH),
    date: new Date(m.timestamp).toLocaleDateString("fr-FR", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    }),
    unread: !m.read,
    priority: m.priority,
  };
}

function summarizeEvent(e: UnifiedEvent): EventSummary {
  const start = new Date(e.start);
  return {
    id: e.id,
    title: e.title,
    day: start.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }),
    time: e.allDay ? "Journée" : start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    location: e.location || undefined,
  };
}

function summarizeFile(f: UnifiedFile): FileSummary {
  return {
    id: f.id,
    name: f.name,
    modified: new Date(f.modifiedTime).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
    shared: f.shared,
  };
}

/* ─── Public API ─── */

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, normal: 1, low: 2 };

export async function getMessages(userId: string): Promise<{ items: MessageSummary[]; total: number; stats: MessageStats }> {
  const raw = await getUnifiedMessages(userId);
  const stats: MessageStats = {
    total: raw.length,
    unread: raw.filter((m) => !m.read).length,
    urgent: raw.filter((m) => m.priority === "urgent").length,
    slack: raw.filter((m) => m.source.provider === "slack").length,
    low: raw.filter((m) => m.priority === "low").length,
  };

  const sorted = [...raw].sort((a, b) => {
    const pDiff = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
    if (pDiff !== 0) return pDiff;
    return b.timestamp - a.timestamp;
  });

  const items = sorted.slice(0, MAX_MESSAGES).map(summarizeMessage);

  if (stats.urgent > 0 && !items.some((m) => m.priority === "urgent")) {
    console.warn(`[Agent/Data] Coherence issue: stats.urgent=${stats.urgent} but no urgent item in top ${MAX_MESSAGES}`);
  }

  return { items, total: raw.length, stats };
}

export async function getEvents(userId: string): Promise<{ items: EventSummary[]; total: number }> {
  const raw = await getUnifiedEvents(userId, 7);
  return {
    items: raw.slice(0, MAX_EVENTS).map(summarizeEvent),
    total: raw.length,
  };
}

export async function getFiles(userId: string): Promise<{ items: FileSummary[]; total: number }> {
  const raw = await getUnifiedFiles(userId, MAX_FILES);
  return {
    items: raw.slice(0, MAX_FILES).map(summarizeFile),
    total: raw.length,
  };
}

/**
 * Fetch a data snapshot for the given surface.
 * - home: messages + events + files
 * - inbox: messages only
 * - calendar: events only
 * - files: files only
 * - other: nothing
 */
export async function getDataSnapshot(userId: string, surface: string): Promise<DataSnapshot> {
  const snapshot: DataSnapshot = {};
  const fetches: Promise<void>[] = [];

  if (surface === "inbox" || surface === "home") {
    fetches.push(getMessages(userId).then((r) => { snapshot.messages = r; }));
  }
  if (surface === "calendar" || surface === "home") {
    fetches.push(getEvents(userId).then((r) => { snapshot.events = r; }));
  }
  if (surface === "files" || surface === "home") {
    fetches.push(getFiles(userId).then((r) => { snapshot.files = r; }));
  }

  await Promise.allSettled(fetches);
  return snapshot;
}

/* ─── Context serializer (snapshot → prompt text) ─── */

export function snapshotToText(snapshot: DataSnapshot): string {
  const sections: string[] = [];

  if (snapshot.messages) {
    const { items, total, stats } = snapshot.messages;
    if (items.length === 0) {
      sections.push("Messages : aucun message récent.\nurgents=0 non_lus=0 slack=0 ignorables=0");
    } else {
      const metricsLine = `urgents=${stats.urgent} non_lus=${stats.unread} slack=${stats.slack} ignorables=${stats.low}`;
      const lines = items.map((m) => {
        const tag = m.priority === "urgent" ? " [URGENT]" : m.priority === "low" ? " [low]" : "";
        return `${m.unread ? "•" : " "} [${m.source}] ${m.from} — ${m.subject}${tag} (${m.date})`;
      });
      const more = total > items.length ? `  (+${total - items.length} autres)` : "";
      sections.push(`Messages (${total}) — ${metricsLine} :\n${lines.join("\n")}${more}`);
    }
  }

  if (snapshot.events) {
    const { items, total } = snapshot.events;
    if (items.length === 0) {
      sections.push("Agenda : aucun événement à venir.");
    } else {
      const lines = items.map((e) => {
        const loc = e.location ? ` — ${e.location}` : "";
        return `  ${e.day} ${e.time} : ${e.title}${loc}`;
      });
      const more = total > items.length ? `  (+${total - items.length} autres)` : "";
      sections.push(`Agenda (${total}) :\n${lines.join("\n")}${more}`);
    }
  }

  if (snapshot.files) {
    const { items, total } = snapshot.files;
    if (items.length === 0) {
      sections.push("Fichiers : aucun fichier récent.");
    } else {
      const lines = items.map((f) => {
        const shared = f.shared ? " [partagé]" : "";
        return `  ${f.name}${shared} (${f.modified})`;
      });
      const more = total > items.length ? `  (+${total - items.length} autres)` : "";
      sections.push(`Fichiers (${total}) :\n${lines.join("\n")}${more}`);
    }
  }

  return sections.join("\n\n");
}
