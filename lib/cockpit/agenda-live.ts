/**
 * Agenda live — Google Calendar via Composio.
 *
 * Lit `GOOGLECALENDAR_LIST_EVENTS` (alias `GOOGLECALENDAR_EVENTS_LIST`)
 * pour today + tomorrow morning. Format normalisé en CockpitAgendaItem.
 *
 * Cache 5min — pareil watchlist, on ne re-frappe pas Google à chaque mount.
 */

import { executeComposioAction } from "@/lib/connectors/composio/client";
import type { CockpitAgendaItem } from "./today";

interface CacheEntry {
  items: CockpitAgendaItem[];
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, CacheEntry>();

function key(scope: { userId: string; tenantId: string }): string {
  return `${scope.tenantId}::${scope.userId}`;
}

interface GcalEvent {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string; responseStatus?: string }>;
  location?: string;
  hangoutLink?: string;
}

function unwrapEvents(raw: unknown): GcalEvent[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as GcalEvent[];
  const obj = raw as { items?: unknown; data?: unknown; events?: unknown; response_data?: unknown };
  if (Array.isArray(obj.items)) return obj.items as GcalEvent[];
  if (Array.isArray(obj.data)) return obj.data as GcalEvent[];
  if (Array.isArray(obj.events)) return obj.events as GcalEvent[];
  if (obj.response_data) return unwrapEvents(obj.response_data);
  return [];
}

function eventStart(ev: GcalEvent): number | null {
  const s = ev.start?.dateTime ?? ev.start?.date;
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

export async function getLiveAgenda(scope: {
  userId: string;
  tenantId: string;
}): Promise<CockpitAgendaItem[]> {
  const k = key(scope);
  const cached = cache.get(k);
  if (cached && cached.expiresAt > Date.now()) return cached.items;

  // Window : maintenant → demain 12h.
  const now = new Date();
  const tomorrowNoon = new Date(now);
  tomorrowNoon.setDate(tomorrowNoon.getDate() + 1);
  tomorrowNoon.setHours(12, 0, 0, 0);

  const res = await executeComposioAction({
    action: "GOOGLECALENDAR_LIST_EVENTS",
    entityId: scope.userId,
    params: {
      calendar_id: "primary",
      time_min: now.toISOString(),
      time_max: tomorrowNoon.toISOString(),
      single_events: true,
      order_by: "startTime",
      max_results: 20,
    },
  });

  if (!res.ok) {
    cache.set(k, { items: [], expiresAt: Date.now() + CACHE_TTL_MS });
    return [];
  }

  const events = unwrapEvents(res.data)
    .map((ev) => ({ ev, startsAt: eventStart(ev) }))
    .filter((x): x is { ev: GcalEvent; startsAt: number } => x.startsAt !== null)
    .sort((a, b) => a.startsAt - b.startsAt);

  const items: CockpitAgendaItem[] = events.map((x, i) => ({
    id: x.ev.id ?? `gcal_${i}`,
    title: x.ev.summary ?? "(sans titre)",
    startsAt: x.startsAt,
    source: "live",
  }));

  cache.set(k, { items, expiresAt: Date.now() + CACHE_TTL_MS });
  return items;
}

export function _resetAgendaCache(): void {
  cache.clear();
}
