/**
 * Unified aggregators — fetch data from all connected sources,
 * map to unified types, merge and sort chronologically.
 *
 * Each aggregator returns a sorted array.
 * New providers = add one fetch + mapper, zero UI changes.
 */

import { gmailConnector } from "./gmail";
import { slackConnector } from "./slack";
import { calendarConnector } from "./calendar";
import { driveConnector } from "./drive";
import { getTokens } from "@/lib/token-store";
import {
  gmailToUnifiedMessage,
  slackToUnifiedMessage,
  calendarToUnifiedEvent,
  driveToUnifiedFile,
} from "./unified-types";
import type { UnifiedMessage, UnifiedEvent, UnifiedFile } from "./unified-types";
import { applyPriorities } from "./priority";

/* ─── Helpers ─── */

interface SourceResult<T> {
  data: T[];
  provider: string;
}

async function fetchSafe<T>(
  fn: () => Promise<SourceResult<T>>,
  provider: string,
): Promise<T[]> {
  try {
    const result = await fn();
    return result.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "not_authenticated" || msg === "token_revoked") {
      return [];
    }
    console.error(`[Unified] ${provider} fetch failed:`, msg);
    return [];
  }
}

/* ─── Messages (Inbox) ─── */

export async function getUnifiedMessages(
  userId: string,
  slackUserId?: string | null,
): Promise<UnifiedMessage[]> {
  const sources: Promise<UnifiedMessage[]>[] = [];

  const googleTokens = await getTokens(userId, "google").catch(() => null);
  if (googleTokens?.accessToken) {
    sources.push(
      fetchSafe(() => gmailConnector.getEmails(userId, 15), "gmail")
        .then((emails) => emails.map(gmailToUnifiedMessage)),
    );
  }

  const suid = slackUserId ?? userId;
  const slackTokens = await getTokens(suid, "slack").catch(() => null);
  if (slackTokens?.accessToken) {
    sources.push(
      fetchSafe(() => slackConnector.getMessages(suid, 20), "slack")
        .then((msgs) => msgs.map(slackToUnifiedMessage)),
    );
  }

  const results = await Promise.all(sources);
  const all = applyPriorities(results.flat());
  all.sort((a, b) => b.timestamp - a.timestamp);
  return all;
}

/* ─── Events (Calendar) ─── */

export async function getUnifiedEvents(
  userId: string,
  daysAhead = 7,
): Promise<UnifiedEvent[]> {
  const sources: Promise<UnifiedEvent[]>[] = [];

  const googleTokens = await getTokens(userId, "google").catch(() => null);
  if (googleTokens?.accessToken) {
    sources.push(
      fetchSafe(() => calendarConnector.getEvents(userId, daysAhead), "calendar")
        .then((events) => events.map(calendarToUnifiedEvent)),
    );
  }

  const results = await Promise.all(sources);
  const all = results.flat();
  all.sort((a, b) => a.timestamp - b.timestamp);
  return all;
}

/* ─── Files ─── */

export async function getUnifiedFiles(
  userId: string,
  limit = 15,
): Promise<UnifiedFile[]> {
  const sources: Promise<UnifiedFile[]>[] = [];

  const googleTokens = await getTokens(userId, "google").catch(() => null);
  if (googleTokens?.accessToken) {
    sources.push(
      fetchSafe(() => driveConnector.getFiles(userId, limit), "drive")
        .then((files) => files.map(driveToUnifiedFile)),
    );
  }

  const results = await Promise.all(sources);
  const all = results.flat();
  all.sort((a, b) => b.timestamp - a.timestamp);
  return all;
}
