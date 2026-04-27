/**
 * POST /api/composio/connect
 *
 * Body: { appName: string, redirectUri?: string }
 * Returns: { ok: true, redirectUrl?: string, connectionId?: string } | { ok: false, error: string }
 *
 * Initiates a Composio OAuth/API-key flow for the authenticated user.
 * The frontend reads `redirectUrl` and sends the user there to complete auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/platform/auth/get-user-id";
import { initiateConnection, isComposioConfigured } from "@/lib/connectors/composio";

const bodySchema = z.object({
  appName: z.string().min(1).max(64),
  redirectUri: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  if (!isComposioConfigured()) {
    return NextResponse.json(
      { error: "composio_not_configured", message: "COMPOSIO_API_KEY not set" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await initiateConnection(userId, parsed.data.appName, parsed.data.redirectUri);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "connect_failed" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    redirectUrl: result.redirectUrl,
    connectionId: result.connectionId,
  });
}
