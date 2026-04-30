/**
 * Google Calendar preview formatters.
 */

import { footer, header, line, preview, asArray, formatDateFR } from "./shared";

function extractDateTime(value: unknown): string {
  if (!value) return "—";
  if (typeof value === "string") return formatDateFR(value);
  if (typeof value === "object" && value !== null) {
    const v = value as Record<string, unknown>;
    return formatDateFR(v.dateTime ?? v.date ?? v);
  }
  return formatDateFR(value);
}

export function formatCalendarCreateEvent(args: Record<string, unknown>): string {
  const summary = String(args.summary ?? args.title ?? "(sans titre)");
  const start = extractDateTime(args.start ?? args.start_datetime);
  const end = extractDateTime(args.end ?? args.end_datetime);
  const location = args.location ? String(args.location) : null;
  const description = args.description ? preview(String(args.description), 200) : null;

  // Attendees can be array of strings or array of {email}
  const rawAttendees = args.attendees;
  let attendeesList: string[] = [];
  if (Array.isArray(rawAttendees)) {
    attendeesList = rawAttendees.map((a) => {
      if (typeof a === "string") return a;
      if (typeof a === "object" && a !== null && "email" in a) {
        return String((a as Record<string, unknown>).email);
      }
      return String(a);
    });
  } else {
    attendeesList = asArray(rawAttendees);
  }

  const lines = [
    line("Titre", summary),
    line("Début", start),
    line("Fin", end),
    location ? line("Lieu", location) : null,
    attendeesList.length > 0
      ? line("Participants", attendeesList.slice(0, 8).join(", "))
      : null,
    description ? line("Description", description) : null,
  ].filter(Boolean) as string[];

  return [header("GOOGLECALENDAR", "Créer un événement"), ...lines, footer()].join("\n");
}
