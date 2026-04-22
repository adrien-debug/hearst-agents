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
import { handleNangoWebhook, type NangoWebhookPayload } from "@/lib/connectors/nango";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Verify webhook signature (if Nango provides signing)
  // const signature = req.headers.get("x-nango-signature");
  // const secret = process.env.NANGO_WEBHOOK_SECRET;

  let payload: unknown;
  try {
    payload = await req.json();
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
