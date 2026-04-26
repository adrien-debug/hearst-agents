/**
 * Nango Webhook Handler
 *
 * Receives webhook events from Nango:
 * - connection.created
 * - connection.deleted
 * - connection.error
 * - auth.error
 */

import { NextRequest, NextResponse } from "next/server";
import { handleNangoWebhook, verifyWebhookSignature, type NangoWebhookPayload } from "@/lib/connectors/nango";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-nango-hmac-sha256");
  const secret = process.env.NANGO_WEBHOOK_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[NangoWebhook] NANGO_WEBHOOK_SECRET unset — rejecting in production");
      return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
    }
    console.warn("[NangoWebhook] NANGO_WEBHOOK_SECRET unset — allowing in non-production only");
  } else if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Basic validation
  if (!isValidWebhookPayload(payload)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const webhookPayload = payload as NangoWebhookPayload;

  try {
    const result = await handleNangoWebhook(webhookPayload, {
      tenantId: "default", // Extract from payload or context
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[NangoWebhook] Handler failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Handler failed" },
      { status: 500 }
    );
  }
}

function isValidWebhookPayload(payload: unknown): payload is NangoWebhookPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "type" in payload &&
    "connectionId" in payload &&
    "provider" in payload &&
    "timestamp" in payload
  );
}
