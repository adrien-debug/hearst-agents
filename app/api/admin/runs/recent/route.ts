import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/scope";
import { getRuns } from "@/lib/engine/runtime/state/adapter";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error } = await requireScope({ context: "GET /api/admin/runs/recent" });
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

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
