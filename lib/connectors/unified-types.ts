/**
 * Unified models — provider-agnostic data types for all surfaces.
 * Every connector maps its raw data into these types.
 * UI components ONLY consume unified types, never provider-specific ones.
 */

/* ─── Shared ─── */

export interface SourceInfo {
  provider: string;     // "gmail" | "slack" | "outlook" | ...
  connectorId: string;  // matches ConnectorMeta.id
}

/* ─── Message ─── */

export interface UnifiedMessage {
  id: string;
  source: SourceInfo;
  from: string;
  fromDetail?: string;
  subject: string;
  preview: string;
  body: string;
  timestamp: number;
  read: boolean;
  priority: "high" | "normal" | "low";
  context?: string;
  canReply: boolean;
}

/* ─── Event ─── */

export interface UnifiedEvent {
  id: string;
  source: SourceInfo;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  timestamp: number;
}

/* ─── File ─── */

export interface UnifiedFile {
  id: string;
  source: SourceInfo;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  url?: string;
  shared: boolean;
  timestamp: number;
}

/* ─── Task ─── */

export interface UnifiedTask {
  id: string;
  source: SourceInfo;
  title: string;
  status: "open" | "done";
  priority?: string;
  dueDate?: string;
  project?: string;
}

/* ─── Mappers: provider-specific → unified ─── */

import type { EmailMessage, SlackMessage, CalendarEvent, FileEntry } from "./types";

export function gmailToUnifiedMessage(raw: EmailMessage): UnifiedMessage {
  const senderName = raw.sender.replace(/<.*>/, "").trim() || raw.sender;
  const senderEmail = raw.sender.match(/<(.+)>/)?.[1] ?? "";
  const ts = raw.date ? new Date(raw.date).getTime() : 0;
  return {
    id: `gmail-${raw.id}`,
    source: { provider: "gmail", connectorId: "gmail" },
    from: senderName,
    fromDetail: senderEmail || undefined,
    subject: raw.subject,
    preview: raw.snippet,
    body: raw.snippet,
    timestamp: ts,
    read: raw.isRead,
    priority: "normal",
    canReply: true,
  };
}

export function slackToUnifiedMessage(raw: SlackMessage): UnifiedMessage {
  const ts = parseFloat(raw.timestamp) * 1000;
  return {
    id: `slack-${raw.id}`,
    source: { provider: "slack", connectorId: "slack" },
    from: raw.sender,
    subject: `#${raw.channelName}`,
    preview: raw.text.slice(0, 200),
    body: raw.text,
    timestamp: ts,
    read: !raw.isMention,
    priority: raw.isMention ? "high" : "normal",
    context: `#${raw.channelName}`,
    canReply: false,
  };
}

export function calendarToUnifiedEvent(raw: CalendarEvent): UnifiedEvent {
  const ts = raw.start ? new Date(raw.start).getTime() : 0;
  return {
    id: `gcal-${raw.id}`,
    source: { provider: "google_calendar", connectorId: "calendar" },
    title: raw.title,
    start: raw.start,
    end: raw.end,
    allDay: raw.allDay,
    location: raw.location,
    timestamp: ts,
  };
}

export function driveToUnifiedFile(raw: FileEntry): UnifiedFile {
  const ts = raw.modifiedTime ? new Date(raw.modifiedTime).getTime() : 0;
  return {
    id: `drive-${raw.id}`,
    source: { provider: "google_drive", connectorId: "drive" },
    name: raw.name,
    mimeType: raw.mimeType,
    size: raw.size,
    modifiedTime: raw.modifiedTime,
    url: raw.webViewLink,
    shared: raw.shared,
    timestamp: ts,
  };
}
