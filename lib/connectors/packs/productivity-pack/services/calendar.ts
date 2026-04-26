import { google } from "googleapis";
import { getGoogleAuth } from "../auth/google";
import type { ConnectorResult, CalendarConnector, CalendarEvent } from "@/lib/connectors/types";

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  description?: string;
  location?: string;
  attendees?: string[];
  isAllDay: boolean;
}

/**
 * Connector Calendar pour l'interface unifiée
 */
export const calendarConnector: CalendarConnector = {
  async getEvents(userId: string, daysAhead = 7): Promise<ConnectorResult<CalendarEvent>> {
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
    
    const result = await getCalendarEvents(userId, timeMin, timeMax, 50);
    
    return {
      data: result.data?.map(e => ({
        id: e.id,
        title: e.title,
        start: e.startTime,
        end: e.endTime,
        allDay: e.isAllDay,
        location: e.location,
      })),
      provider: "google-calendar",
    };
  },
};

/**
 * Récupère les événements du calendrier pour une période donnée
 */
export async function getCalendarEvents(
  userId: string,
  timeMin: string,
  timeMax: string,
  maxResults = 10,
): Promise<ConnectorResult<GoogleCalendarEvent>> {
  const auth = await getGoogleAuth(userId);
  const calendar = google.calendar({ version: "v3", auth });

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
  });

  const events = (response.data.items ?? []).map((event): GoogleCalendarEvent => {
    const start = event.start?.dateTime ?? event.start?.date ?? "";
    const end = event.end?.dateTime ?? event.end?.date ?? "";
    
    return {
      id: event.id ?? "",
      title: event.summary ?? "(Sans titre)",
      startTime: start,
      endTime: end,
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      attendees: event.attendees?.map(a => a.displayName ?? a.email ?? "").filter(Boolean),
      isAllDay: !!event.start?.date,
    };
  });

  return { data: events, provider: "google-calendar" };
}

/**
 * Récupère les événements d'aujourd'hui
 */
export async function getTodayEvents(userId: string, maxResults = 10): Promise<GoogleCalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const result = await getCalendarEvents(
    userId,
    startOfDay.toISOString(),
    endOfDay.toISOString(),
    maxResults,
  );

  return result.data ?? [];
}

/**
 * Récupère les événements des prochains jours
 */
export async function getUpcomingEvents(
  userId: string,
  days = 7,
  maxResults = 20,
): Promise<GoogleCalendarEvent[]> {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const result = await getCalendarEvents(userId, timeMin, timeMax, maxResults);
  return result.data ?? [];
}

/**
 * Recherche des événements par titre/description
 */
export async function searchCalendarEvents(
  userId: string,
  query: string,
  maxResults = 10,
): Promise<GoogleCalendarEvent[]> {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 jours

  const result = await getCalendarEvents(userId, timeMin, timeMax, maxResults * 2);
  const events = result.data ?? [];

  // Filtrer par query
  const lowerQuery = query.toLowerCase();
  return events.filter(
    e =>
      e.title.toLowerCase().includes(lowerQuery) ||
      (e.description?.toLowerCase() ?? "").includes(lowerQuery) ||
      (e.location?.toLowerCase() ?? "").includes(lowerQuery),
  );
}
