/**
 * Nango Integration Layer — Barrel Export
 *
 * Centralized exports for Nango SDK integration.
 * Provides 200+ OAuth/API connectors with unified interface.
 */

// Core
export { getNangoClient, getNangoConfig, resetNangoClient, setNangoClient, isNangoEnabled } from "./client";

// Proxy
export {
  nangoProxy,
  checkConnection,
  listUserConnections,
  buildConnectionId,
  parseConnectionId,
  type ProxyOptions,
} from "./proxy";

// Credentials Sync
export {
  syncNangoConnection,
  removeConnection,
  getConnectionRecord,
  listActiveConnections,
  type SyncConnectionInput,
} from "./credentials";

// Webhooks
export { handleNangoWebhook, verifyWebhookSignature, type WebhookHandlerContext } from "./webhooks";

// Connectors Config
export { INITIAL_NANGO_CONNECTORS, ALL_NANGO_CONNECTORS, getConnectorDefinition, isNangoConnector } from "./connectors";

// Types
export type {
  NangoProvider,
  NangoConnection,
  NangoConnectionRecord,
  NangoProxyRequest,
  NangoProxyResponse,
  NangoWebhookPayload,
  NangoClient,
  NangoConfig,
} from "./types";
