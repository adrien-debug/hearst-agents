/**
 * GET /api/composio/connections
 *
 * Returns the authenticated user's Composio-connected accounts.
 * Multi-tenant by design — Composio filters server-side on entityId = userId.
 */

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/platform/auth/get-user-id";
import { listConnections, isComposioConfigured } from "@/lib/connectors/composio";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  if (!isComposioConfigured()) {
    return NextResponse.json({ ok: true, connections: [] });
  }

  const connections = await listConnections(userId);
  return NextResponse.json({ ok: true, connections });
}
