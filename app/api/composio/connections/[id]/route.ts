/**
 * DELETE /api/composio/connections/[id]
 *
 * Disconnects one of the authenticated user's Composio accounts.
 * The Composio SDK enforces entityId-scoped permissions server-side, so we
 * can't accidentally delete another user's connection.
 */

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/platform/auth/get-user-id";
import { disconnectAccount, isComposioConfigured } from "@/lib/connectors/composio";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  if (!isComposioConfigured()) {
    return NextResponse.json(
      { error: "composio_not_configured" },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "missing_connection_id" }, { status: 400 });
  }

  const result = await disconnectAccount(userId, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "disconnect_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
