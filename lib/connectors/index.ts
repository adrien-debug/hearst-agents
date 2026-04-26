export type { EmailMessage, CalendarEvent, FileEntry, TaskItem, SlackMessage, ConnectorResult } from "./types";
export type { EmailConnector, CalendarConnector, FileConnector, TaskConnector, SlackConnector } from "./types";
export type { ConnectorSource, ConnectorMeta } from "./types";

export type { UnifiedMessage, UnifiedEvent, UnifiedFile, UnifiedTask, SourceInfo } from "./unified-types";
export { gmailToUnifiedMessage, slackToUnifiedMessage, calendarToUnifiedEvent, driveToUnifiedFile } from "./unified-types";
export { getUnifiedMessages, getUnifiedEvents, getUnifiedFiles } from "./unified";

export { gmailConnector } from "./packs/productivity-pack/services/gmail";
export { calendarConnector } from "./packs/productivity-pack/services/calendar";
export { driveConnector } from "./packs/productivity-pack/services/drive";
export { slackConnector } from "./packs/productivity-pack/services/slack";

export { CORE_CONNECTORS, EXTERNAL_CONNECTORS, ALL_CONNECTORS, getConnector } from "./registry";

// Router (Phase A) — Pack-first routing with Nango fallback
export {
  routeConnectorRequest,
  getRouterStats,
  type RouterResult,
  type RouterContext,
} from "./router";
