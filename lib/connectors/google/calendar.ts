import { google } from "googleapis";
import { getGoogleAuth } from "./auth";

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  description?: string;
  location?: string;
  attendees?: string[];
  isAllDay: boolean;
}

async function listEvents(
  userId: string,
  timeMin: string,
  timeMax: string,
  maxResults = 10,
): Promise<CalendarEvent[]> {
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

  return (response.data.items ?? []).map((event): CalendarEvent => {
    const start = event.start?.dateTime ?? event.start?.date ?? "";
    const end = event.end?.dateTime ?? event.end?.date ?? "";
    return {
      id: event.id ?? "",
      title: event.summary ?? "(Sans titre)",
      startTime: start,
      endTime: end,
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      attendees: event.attendees
        ?.map((a) => a.displayName ?? a.email ?? "")
        .filter(Boolean),
      isAllDay: !!event.start?.date,
    };
  });
}

export async function getTodayEvents(userId: string, maxResults = 10): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return listEvents(userId, startOfDay.toISOString(), endOfDay.toISOString(), maxResults);
}

export async function getUpcomingEvents(
  userId: string,
  days = 7,
  maxResults = 20,
): Promise<CalendarEvent[]> {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  return listEvents(userId, timeMin, timeMax, maxResults);
}

export interface CreateCalendarEventInput {
  summary: string;
  /** ISO 8601 start, e.g. "2026-04-29T14:00:00+02:00". */
  start: string;
  /** ISO 8601 end. */
  end: string;
  description?: string;
  location?: string;
  /** RFC 5322 emails. */
  attendees?: string[];
}

export interface CreateCalendarEventResult {
  id: string;
  htmlLink: string;
}

/**
 * Create an event on the user's primary Google Calendar. Requires the
 * `calendar.events` OAuth scope (requested by NextAuth at sign-in).
 */
export async function createCalendarEvent(
  userId: string,
  input: CreateCalendarEventInput,
): Promise<CreateCalendarEventResult> {
  const auth = await getGoogleAuth(userId);
  const calendar = google.calendar({ version: "v3", auth });

  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: { dateTime: input.start },
      end: { dateTime: input.end },
      attendees: input.attendees?.map((email) => ({ email })),
    },
    sendUpdates: input.attendees && input.attendees.length > 0 ? "all" : "none",
  });

  return {
    id: res.data.id ?? "",
    htmlLink: res.data.htmlLink ?? "",
  };
}
