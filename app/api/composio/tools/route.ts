/**
 * GET /api/composio/tools?apps=gmail,slack
 *
 * Returns the LLM-callable actions available to the authenticated user
 * for their currently connected apps. Used by the orchestrator (server-side
 * primarily) and by the apps page to display "what your agent can do".
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/platform/auth/get-user-id";
import {
  getToolsForUser,
  isComposioConfigured,
  getComposio,
  getComposioInitError,
} from "@/lib/connectors/composio";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  if (!isComposioConfigured()) {
    return NextResponse.json(
      { ok: false, error: "composio_not_configured", message: "COMPOSIO_API_KEY not set" },
      { status: 503 },
    );
  }
  const client = await getComposio();
  if (!client) {
    const err = getComposioInitError();
    return NextResponse.json(
      { ok: false, error: err?.code ?? "composio_unavailable", message: err?.message ?? "Composio SDK could not be loaded" },
      { status: 503 },
    );
  }

  const appsParam = req.nextUrl.searchParams.get("apps");
  const apps = appsParam ? appsParam.split(",").map((a) => a.trim()).filter(Boolean) : undefined;

  let tools;
  try {
    tools = await getToolsForUser(userId, { apps });
  } catch (err) {
    return NextResponse.json(
      { error: "service_unavailable", detail: err instanceof Error ? err.message : "unknown" },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, tools });
}
