/**
 * Native Google tools — exposés directement à la pipeline IA.
 *
 * Le user obtient les scopes Gmail / Calendar / Drive en read+write au
 * moment du SSO Google (cf. `lib/platform/auth/options.ts`). Ces tools
 * utilisent le client `getGoogleAuth(userId)` qui pioche les tokens
 * depuis la table `user_tokens` — pas de Composio, pas de 2e popup OAuth.
 *
 * Les write tools (`gmail_send_email`, `googlecalendar_create_event`)
 * suivent le même protocole `_preview: true|false` que les outils
 * Composio pour rester cohérents avec les boutons Confirmer/Annuler.
 */

import { jsonSchema } from "ai";
import type { Tool } from "ai";
import { getTokens } from "@/lib/platform/auth/tokens";
import { getRecentEmails, sendEmail } from "@/lib/connectors/google/gmail";
import {
  getTodayEvents,
  getUpcomingEvents,
  createCalendarEvent,
} from "@/lib/connectors/google/calendar";
import { getRecentFiles } from "@/lib/connectors/google/drive";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AiToolMap = Record<string, Tool<any, any>>;

const SEND_PREVIEW_FOOTER =
  "\n\n↩ Réponds **confirmer** pour envoyer, ou **annuler** pour abandonner.";

const EVENT_PREVIEW_FOOTER =
  "\n\n↩ Réponds **confirmer** pour créer l'événement, ou **annuler** pour abandonner.";

function fmtSendDraft(args: { to: string; subject: string; body: string; cc?: string; bcc?: string }): string {
  const lines = [
    `📧 Draft · GMAIL · Envoyer`,
    ``,
    `**to** : ${args.to}`,
    args.cc ? `**cc** : ${args.cc}` : "",
    args.bcc ? `**bcc** : ${args.bcc}` : "",
    `**subject** : ${args.subject}`,
    ``,
    args.body,
  ].filter(Boolean);
  return lines.join("\n") + SEND_PREVIEW_FOOTER;
}

function fmtEventDraft(args: {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
}): string {
  const lines = [
    `📆 Draft · GOOGLE CALENDAR · Créer un événement`,
    ``,
    `**titre** : ${args.summary}`,
    `**début** : ${args.start}`,
    `**fin** : ${args.end}`,
    args.location ? `**lieu** : ${args.location}` : "",
    args.attendees && args.attendees.length > 0
      ? `**participants** : ${args.attendees.join(", ")}`
      : "",
    args.description ? `\n${args.description}` : "",
  ].filter(Boolean);
  return lines.join("\n") + EVENT_PREVIEW_FOOTER;
}

interface FetchEmailsArgs {
  limit?: number;
}

interface SendEmailArgs {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  _preview?: boolean;
}

interface ListEventsArgs {
  scope?: "today" | "upcoming";
  days?: number;
  limit?: number;
}

interface CreateEventArgs {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
  _preview?: boolean;
}

interface ListFilesArgs {
  limit?: number;
}

/**
 * Build the native Google tool map for a user. Returns `{}` if the user
 * isn't connected to Google via NextAuth (no access token in user_tokens).
 */
export async function buildNativeGoogleTools(userId: string): Promise<AiToolMap> {
  let hasGoogle = false;
  try {
    const tokens = await getTokens(userId, "google");
    hasGoogle = Boolean(tokens?.accessToken);
  } catch {
    hasGoogle = false;
  }
  if (!hasGoogle) return {};

  const fetchEmails: Tool<FetchEmailsArgs, unknown> = {
    description:
      "Fetch the most recent inbox emails of the connected Google account. Use this when the user asks to summarize, list, or read emails.",
    inputSchema: jsonSchema<FetchEmailsArgs>({
      type: "object",
      properties: {
        limit: { type: "number", description: "Max number of emails (default 10, capped at 25)." },
      },
    }),
    execute: async (args: FetchEmailsArgs) => {
      const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);
      return getRecentEmails(userId, limit);
    },
  };

  const sendEmailTool: Tool<SendEmailArgs, unknown> = {
    description:
      "Send an email through the connected Google account. Two-step protocol: call first with `_preview: true` (default) to show a draft, then with `_preview: false` after the user explicitly confirms.",
    inputSchema: jsonSchema<SendEmailArgs>({
      type: "object",
      required: ["to", "subject", "body"],
      properties: {
        to: { type: "string", description: "Recipient email." },
        subject: { type: "string" },
        body: { type: "string" },
        cc: { type: "string" },
        bcc: { type: "string" },
        _preview: {
          type: "boolean",
          description:
            "Set to true (default) to show a draft. Set to false ONLY after user confirmation.",
          default: true,
        },
      },
    }),
    execute: async (args: SendEmailArgs) => {
      const isPreview = args._preview !== false;
      if (isPreview) return fmtSendDraft(args);
      return sendEmail(userId, {
        to: args.to,
        subject: args.subject,
        body: args.body,
        cc: args.cc,
        bcc: args.bcc,
      });
    },
  };

  const listEvents: Tool<ListEventsArgs, unknown> = {
    description:
      "List events from the connected Google Calendar. `scope: 'today'` returns today's events; `scope: 'upcoming'` returns events for the next N days (default 7).",
    inputSchema: jsonSchema<ListEventsArgs>({
      type: "object",
      properties: {
        scope: { type: "string", enum: ["today", "upcoming"], default: "upcoming" },
        days: { type: "number", description: "Window in days when scope is 'upcoming' (default 7)." },
        limit: { type: "number", description: "Max events (default 20, capped at 50)." },
      },
    }),
    execute: async (args: ListEventsArgs) => {
      const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
      if (args.scope === "today") return getTodayEvents(userId, limit);
      const days = Math.min(Math.max(args.days ?? 7, 1), 60);
      return getUpcomingEvents(userId, days, limit);
    },
  };

  const createEvent: Tool<CreateEventArgs, unknown> = {
    description:
      "Create an event on the connected Google Calendar. Two-step protocol: call first with `_preview: true` (default), then `_preview: false` after user confirms.",
    inputSchema: jsonSchema<CreateEventArgs>({
      type: "object",
      required: ["summary", "start", "end"],
      properties: {
        summary: { type: "string", description: "Event title." },
        start: { type: "string", description: "ISO 8601 start datetime with timezone." },
        end: { type: "string", description: "ISO 8601 end datetime with timezone." },
        description: { type: "string" },
        location: { type: "string" },
        attendees: { type: "array", items: { type: "string" } },
        _preview: { type: "boolean", default: true },
      },
    }),
    execute: async (args: CreateEventArgs) => {
      const isPreview = args._preview !== false;
      if (isPreview) return fmtEventDraft(args);
      return createCalendarEvent(userId, {
        summary: args.summary,
        start: args.start,
        end: args.end,
        description: args.description,
        location: args.location,
        attendees: args.attendees,
      });
    },
  };

  const listFiles: Tool<ListFilesArgs, unknown> = {
    description:
      "List the most recent files in the connected Google Drive. Use this to surface documents the user has been working on.",
    inputSchema: jsonSchema<ListFilesArgs>({
      type: "object",
      properties: {
        limit: { type: "number", description: "Max files (default 10, capped at 25)." },
      },
    }),
    execute: async (args: ListFilesArgs) => {
      const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);
      return getRecentFiles(userId, limit);
    },
  };

  return {
    gmail_fetch_emails: fetchEmails,
    gmail_send_email: sendEmailTool,
    googlecalendar_list_events: listEvents,
    googlecalendar_create_event: createEvent,
    googledrive_list_files: listFiles,
  };
}

/**
 * App labels exposed by the native tool surface — used by
 * `buildAgentSystemPrompt` to list them in the OUTILS section.
 */
export const NATIVE_GOOGLE_TOOL_DESCRIPTORS = [
  { name: "GMAIL_FETCH_EMAILS", description: "Lis les emails récents de la boîte de réception Google connectée." },
  { name: "GMAIL_SEND_EMAIL", description: "Envoie un email via le compte Google connecté (preview/confirm)." },
  { name: "GOOGLECALENDAR_LIST_EVENTS", description: "Liste les événements du Google Calendar connecté." },
  { name: "GOOGLECALENDAR_CREATE_EVENT", description: "Crée un événement sur le Google Calendar connecté (preview/confirm)." },
  { name: "GOOGLEDRIVE_LIST_FILES", description: "Liste les fichiers récents du Google Drive connecté." },
] as const;
