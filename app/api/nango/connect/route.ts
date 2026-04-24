/**
 * Nango Connect — Initiate OAuth flow
 *
 * Returns the configuration needed by the frontend to initiate OAuth via Nango.
 * The frontend uses @nangohq/frontend to open the OAuth popup.
 */

import { NextRequest, NextResponse } from "next/server";
import { buildConnectionId, isNangoEnabled, getNangoConfig } from "@/lib/connectors/nango";
import { getUserId } from "@/lib/get-user-id";
import { z } from "zod";

const requestSchema = z.object({
  provider: z.string(),
});

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  if (!isNangoEnabled()) {
    console.warn("[NangoConnect] NANGO_SECRET_KEY not configured");
    return NextResponse.json(
      { error: "nango_not_configured", message: "NANGO_SECRET_KEY not set" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error }, { status: 400 });
  }

  const { provider } = parsed.data;
  const connectionId = buildConnectionId(userId, provider);
  const nangoConfig = getNangoConfig();

  // Log for debugging
  console.log(`[NangoConnect] Initiating OAuth:`, {
    provider,
    connectionId: connectionId.slice(0, 20) + "...",
    userId: userId.slice(0, 8),
  });

  // Return config for frontend — frontend uses @nangohq/frontend SDK
  return NextResponse.json({
    success: true,
    config: {
      provider,
      connectionId,
      publicKey: nangoConfig.secretKey.slice(0, 20) + "...", // Frontend SDK needs this
      host: nangoConfig.host,
      // Callback will be handled by Nango and redirected to /api/nango/callback
    },
  });
}
