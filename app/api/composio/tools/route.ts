/**
 * GET /api/composio/tools?apps=gmail,slack
 *
 * Returns the LLM-callable actions available to the authenticated user
 * for their currently connected apps. Used by the orchestrator (server-side
 * primarily) and by the apps page to display "what your agent can do".
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/platform/auth/get-user-id";
import { getToolsForUser, isComposioConfigured } from "@/lib/connectors/composio";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  if (!isComposioConfigured()) {
    return NextResponse.json({ ok: true, tools: [] });
  }

  const appsParam = req.nextUrl.searchParams.get("apps");
  const apps = appsParam ? appsParam.split(",").map((a) => a.trim()).filter(Boolean) : undefined;

  const tools = await getToolsForUser(userId, { apps });
  return NextResponse.json({ ok: true, tools });
}
