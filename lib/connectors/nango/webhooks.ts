/**
 * Nango Webhook Handlers
 *
 * Handles Nango webhooks for connection lifecycle events:
 * - connection.created
 * - connection.deleted
 * - connection.error (token refresh failed)
 * - auth.error
 */

import type { NangoWebhookPayload, NangoProvider } from "./types";
import { syncNangoConnection, removeConnection } from "./credentials";
import { parseConnectionId } from "./proxy";

export interface WebhookHandlerContext {
  tenantId: string;
}

/**
 * Handle incoming Nango webhook
 */
export async function handleNangoWebhook(
  payload: NangoWebhookPayload,
  context: WebhookHandlerContext
): Promise<{ success: boolean; action: string }> {
  console.log(`[NangoWebhook] ${payload.type} — ${payload.provider} — ${payload.connectionId}`);

  switch (payload.type) {
    case "connection.created": {
      // Extract userId from connectionId (format: hearst-{userId}-{provider})
      const userId = extractUserIdFromConnectionId(payload.connectionId);
      if (!userId) {
        return { success: false, action: "invalid_connection_id" };
      }

      await syncNangoConnection({
        userId,
        tenantId: context.tenantId,
        provider: payload.provider as NangoProvider,
        nangoConnectionId: payload.connectionId,
        status: "active",
      });

    console.log(`[NangoWebhook] Integration connected: ${payload.provider} for user ${userId.slice(0, 8)}`);

    return { success: true, action: "synced_active" };
    }

    case "connection.deleted": {
      const userId = extractUserIdFromConnectionId(payload.connectionId);
      if (!userId) {
        return { success: false, action: "invalid_connection_id" };
      }

      await removeConnection(userId, payload.provider as NangoProvider);

    console.log(`[NangoWebhook] Integration disconnected: ${payload.provider} for user ${userId.slice(0, 8)}`);

    return { success: true, action: "removed" };
    }

    case "connection.error":
    case "auth.error": {
      const userId = extractUserIdFromConnectionId(payload.connectionId);
      if (!userId) {
        return { success: false, action: "invalid_connection_id" };
      }

      await syncNangoConnection({
        userId,
        tenantId: context.tenantId,
        provider: payload.provider as NangoProvider,
        nangoConnectionId: payload.connectionId,
        status: "error",
        metadata: { error: payload.error },
      });

    console.error(`[NangoWebhook] OAuth error for ${payload.provider}: ${payload.error} (user ${userId.slice(0, 8)})`);

    return { success: true, action: "marked_error" };
    }

    default:
      console.warn(`[NangoWebhook] Unknown event type: ${payload.type}`);
      return { success: false, action: "unknown_event_type" };
  }
}

/**
 * Extract userId from Nango connection ID.
 * Delegates to parseConnectionId for canonical hex + legacy support.
 */
function extractUserIdFromConnectionId(connectionId: string): string | null {
  return parseConnectionId(connectionId)?.userId ?? null;
}

/**
 * Verify webhook signature (if Nango provides signing)
 * Placeholder — implement based on Nango docs
 */
export function verifyWebhookSignature(
  _payload: string,
  _signature: string,
  _secret: string
): boolean {
  // TODO: Implement HMAC signature verification when Nango supports it
  // For now, rely on IP allowlist and HTTPS
  return true;
}
