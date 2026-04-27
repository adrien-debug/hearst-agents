/**
 * POST /api/composio/invalidate-cache
 *
 * Wipes the in-process Composio tool-discovery cache for the authenticated
 * user. Called by the frontend when the user returns from an OAuth flow
 * (URL contains `?connected=<app>`) so that the next `getToolsForUser()`
 * fetches a fresh tool list including the just-authorised app.
 */

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/platform/auth/get-user-id";
import { invalidateUserDiscovery } from "@/lib/connectors/composio/discovery";

export async function POST() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  invalidateUserDiscovery(userId);
  return NextResponse.json({ ok: true });
}
