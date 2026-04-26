/**
 * Nango Webhook Handlers
 *
 * Handles Nango webhooks for connection lifecycle events:
 * - connection.created
 * - connection.deleted
 * - connection.error (token refresh failed)
 * - auth.error
 */

import { createHmac, timingSafeEqual } from "crypto";
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
      // Extract userId from connectionId (canonical: hearstx-{hex(userId)}-{provider},
      // legacy fallback: hearst-{normalizedUserId}-{provider})
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
 * Verify a Nango webhook signature.
 *
 * Matches Nango's secure scheme: HMAC-SHA256 of the raw request body using
 * NANGO_WEBHOOK_SECRET as the key, hex-encoded, sent in the
 * `x-nango-hmac-sha256` header. Reference:
 * https://github.com/NangoHQ/nango/blob/master/packages/webhooks/lib/utils.ts
 *
 * `rawBody` MUST be the exact bytes received — do not parse and re-stringify.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}
