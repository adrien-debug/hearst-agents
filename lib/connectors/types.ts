export interface EmailMessage {
  id: string;
  subject: string;
  sender: string;
  snippet: string;
  date: string;
  isRead: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
}

export interface FileEntry {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  webViewLink?: string;
  shared: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  status: "open" | "done";
  priority?: string;
  dueDate?: string;
  project?: string;
}

export interface ConnectorResult<T> {
  data: T[];
  provider: string;
}

export interface EmailConnector {
  getEmails(userId: string, limit?: number): Promise<ConnectorResult<EmailMessage>>;
}

export interface CalendarConnector {
  getEvents(userId: string, daysAhead?: number): Promise<ConnectorResult<CalendarEvent>>;
}

export interface FileConnector {
  getFiles(userId: string, limit?: number): Promise<ConnectorResult<FileEntry>>;
}

export interface TaskConnector {
  getTasks(userId: string, limit?: number): Promise<ConnectorResult<TaskItem>>;
}

export interface SlackMessage {
  id: string;
  channel: string;
  channelName: string;
  sender: string;
  senderAvatar?: string;
  text: string;
  timestamp: string;
  threadTs?: string;
  isMention: boolean;
}

export interface SlackConnector {
  getMessages(userId: string, limit?: number): Promise<ConnectorResult<SlackMessage>>;
}

/* ─── Connector Registry ─── */

export type ConnectorSource = "core" | "external";

export interface ConnectorMeta {
  id: string;
  name: string;
  description: string;
  icon: string;
  source: ConnectorSource;
  category: "communication" | "productivity" | "storage" | "project" | "crm" | "dev" | "analytics" | "other";
  provider?: string;
  connectAction?: "google" | "slack" | null;
}
