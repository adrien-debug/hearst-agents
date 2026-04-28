/**
 * Adapter Google natif — Gmail / Calendar / Drive.
 *
 * Réutilise les fetchers typés existants ([lib/connectors/google/]) et les
 * convertit en Tabular. Ces fetchers utilisent les tokens user_tokens (SSO
 * NextAuth), pas de Composio popup.
 */

import {
  getRecentEmails,
  type EmailSummary,
} from "@/lib/connectors/google/gmail";
import {
  getTodayEvents,
  getUpcomingEvents,
  type CalendarEvent,
} from "@/lib/connectors/google/calendar";
import {
  getRecentFiles,
  searchDriveFiles,
  type DriveFile,
} from "@/lib/connectors/google/drive";
import type { Tabular } from "@/lib/reports/engine/tabular";

export type GoogleService = "gmail" | "calendar" | "drive";

export interface FetchGoogleInput {
  service: GoogleService;
  /**
   * Op canonique :
   *   gmail    : "messages.list"
   *   calendar : "events.today" | "events.upcoming"
   *   drive    : "files.recent" | "files.search"
   */
  op: string;
  params: Record<string, unknown>;
  userId: string;
}

export interface FetchGoogleResult {
  rows: Tabular;
  ok: boolean;
  error?: string;
}

export async function fetchGoogle(input: FetchGoogleInput): Promise<FetchGoogleResult> {
  try {
    const rows = await dispatch(input);
    return { rows, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { rows: [], ok: false, error: msg };
  }
}

async function dispatch(input: FetchGoogleInput): Promise<Tabular> {
  const { service, op, params, userId } = input;

  if (service === "gmail" && op === "messages.list") {
    const limit = clampInt(params.limit, 1, 200, 25);
    const emails = await getRecentEmails(userId, limit);
    return emails.map(emailToRow);
  }

  if (service === "calendar" && op === "events.today") {
    const limit = clampInt(params.limit, 1, 50, 10);
    const events = await getTodayEvents(userId, limit);
    return events.map(eventToRow);
  }

  if (service === "calendar" && op === "events.upcoming") {
    const days = clampInt(params.days, 1, 30, 7);
    const limit = clampInt(params.limit, 1, 100, 50);
    const events = await getUpcomingEvents(userId, days, limit);
    return events.map(eventToRow);
  }

  if (service === "drive" && op === "files.recent") {
    const limit = clampInt(params.limit, 1, 100, 25);
    const files = await getRecentFiles(userId, limit);
    return files.map(fileToRow);
  }

  if (service === "drive" && op === "files.search") {
    const query = String(params.query ?? "");
    if (!query) throw new Error("drive.files.search requiert 'query'");
    const limit = clampInt(params.limit, 1, 100, 25);
    const files = await searchDriveFiles(userId, query, limit);
    return files.map(fileToRow);
  }

  throw new Error(`Op Google inconnue : ${service}.${op}`);
}

// ── normalisation row ──────────────────────────────────────

function emailToRow(e: EmailSummary): Record<string, unknown> {
  return {
    id: e.id,
    subject: e.subject,
    sender: e.sender,
    snippet: e.snippet,
    date: e.date,
    is_read: e.isRead,
  };
}

function eventToRow(ev: CalendarEvent): Record<string, unknown> {
  return ev as unknown as Record<string, unknown>;
}

function fileToRow(f: DriveFile): Record<string, unknown> {
  return f as unknown as Record<string, unknown>;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
