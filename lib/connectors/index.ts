/**
 * Connectors public surface.
 *
 * After the legacy cleanup (packs / Nango router / specialized agents
 * removed), the connectors layer is two things:
 *  - `composio/*`  → discovery + execution of agent actions per user
 *  - `google/*`    → direct Google API calls (NextAuth-backed) for the
 *                    Calendar/Gmail/Drive read paths used by data-retriever
 *                    and the KnowledgeRetriever delegate.
 *
 * Anything else has been removed. Re-export the few external entry points
 * we still expose so callers don't import from deep paths.
 */

export {
  executeComposioAction,
  isComposioConfigured,
  resetComposioClient,
  getComposio,
  gmailSendEmail,
  getToolsForUser,
  invalidateUserDiscovery,
  resetDiscoveryCache,
  toAnthropicTools,
  toOpenAITools,
  initiateConnection,
  listConnections,
  disconnectAccount,
} from "./composio";
export type {
  ComposioCallParams,
  ComposioResult,
  ComposioErrorCode,
  GmailSendInput,
  GmailSendOutput,
  DiscoveredTool,
  ConnectedAccount,
  InitiateConnectionResult,
} from "./composio";

export { retrieveUserDataContext, DataRetriever, detectDataIntent } from "./data-retriever";
export type {
  UserDataContext,
  CalendarEvent as RetrievedCalendarEvent,
  EmailMessage as RetrievedEmailMessage,
  DriveFile as RetrievedDriveFile,
  RetrieveProgress,
} from "./data-retriever";
