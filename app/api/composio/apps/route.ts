/**
 * GET /api/composio/apps
 *
 * Returns the full Composio app catalog (cached 30 min process-wide).
 * Used by the apps page to render the by-category grid.
 */

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/platform/auth/get-user-id";
import { listAvailableApps, isComposioConfigured } from "@/lib/connectors/composio";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isComposioConfigured()) {
    return NextResponse.json({ ok: true, apps: [] });
  }
  const apps = await listAvailableApps();
  return NextResponse.json({ ok: true, apps });
}
