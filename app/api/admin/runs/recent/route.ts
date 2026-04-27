/**
 * GET /api/admin/runs/recent — last N orchestrator_v2 runs.
 *
 * Powers the run rail in the admin canvas (sidebar of replay-able runs).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isError } from "../../_helpers";
import { getRuns } from "@/lib/engine/runtime/state/adapter";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin("GET /api/admin/runs/recent", { resource: "runs", action: "read" });
  if (isError(guard)) return guard;

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10) || 10, 50);
  const userId = url.searchParams.get("userId") ?? undefined;

  try {
    const runs = await getRuns({ userId, limit });
    return NextResponse.json({ runs });
  } catch (e) {
    console.error("[Admin API] GET /runs/recent error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
