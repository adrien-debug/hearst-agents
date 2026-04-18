import { google } from "googleapis";
import { getGoogleAuth } from "./google-auth";
import type { CalendarConnector, ConnectorResult, CalendarEvent } from "./types";

export const calendarConnector: CalendarConnector = {
  async getEvents(userId: string, daysAhead = 7): Promise<ConnectorResult<CalendarEvent>> {
    const auth = await getGoogleAuth(userId);
    const cal = google.calendar({ version: "v3", auth });

    const now = new Date();
    const until = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const res = await cal.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: until.toISOString(),
      maxResults: 20,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events: CalendarEvent[] = (res.data.items ?? []).map((item) => ({
      id: item.id ?? "",
      title: item.summary ?? "(sans titre)",
      start: item.start?.dateTime ?? item.start?.date ?? "",
      end: item.end?.dateTime ?? item.end?.date ?? "",
      allDay: !item.start?.dateTime,
      location: item.location ?? undefined,
    }));

    return { data: events, provider: "google_calendar" };
  },
};
