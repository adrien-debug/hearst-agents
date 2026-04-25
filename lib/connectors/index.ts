export type { EmailMessage, CalendarEvent, FileEntry, TaskItem, SlackMessage, ConnectorResult } from "./types";
export type { EmailConnector, CalendarConnector, FileConnector, TaskConnector, SlackConnector } from "./types";
export type { ConnectorSource, ConnectorMeta } from "./types";

export type { UnifiedMessage, UnifiedEvent, UnifiedFile, UnifiedTask, SourceInfo } from "./unified-types";
export { gmailToUnifiedMessage, slackToUnifiedMessage, calendarToUnifiedEvent, driveToUnifiedFile } from "./unified-types";
export { getUnifiedMessages, getUnifiedEvents, getUnifiedFiles } from "./unified";

export { gmailConnector } from "./gmail";
export { calendarConnector } from "./calendar";
export { driveConnector } from "./drive";
export { slackConnector } from "./slack";

export { CORE_CONNECTORS, EXTERNAL_CONNECTORS, ALL_CONNECTORS, getConnector } from "./registry";

// Router (Phase A) — Pack-first routing with Nango fallback
export {
  routeConnectorRequest,
  getRouterStats,
  type RouterResult,
  type RouterContext,
} from "./router";
