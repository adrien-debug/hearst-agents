/**
 * Core Types — Connectors
 *
 * Canonical re-exports for connector-related types.
 * Original definitions stay in their modules; this barrel centralizes access.
 */

export type {
  EmailMessage,
  CalendarEvent,
  FileEntry,
  TaskItem,
  ConnectorResult,
  EmailConnector,
  CalendarConnector,
  FileConnector,
  TaskConnector,
  SlackMessage,
  SlackConnector,
  ConnectorSource,
  ConnectorMeta,
} from "@/lib/connectors/types";

export type {
  ConnectorCapability,
  ConnectorDefinition,
} from "@/lib/connectors/platform/types";

export type {
  PackManifest,
  ConnectorManifest,
  ConnectorInstance,
  ConnectorCategory,
  ConnectorAuthType,
  ConnectorHealth,
} from "@/lib/connectors/packs/types";
