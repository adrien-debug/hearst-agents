/**
 * Nango Connect — Get OAuth configuration
 *
 * Returns the configuration needed by the frontend to initiate OAuth via Nango.
 * The frontend uses @nangohq/frontend to open the OAuth popup.
 */

import { NextRequest, NextResponse } from "next/server";
import { buildConnectionId, isNangoEnabled } from "@/lib/connectors/nango";
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

  // Return config for frontend — frontend uses @nangohq/frontend SDK
  return NextResponse.json({
    success: true,
    config: {
      provider,
      connectionId,
      // Frontend will use these to open OAuth via Nango.connect()
    },
  });
}
