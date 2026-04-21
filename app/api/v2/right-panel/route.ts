/**
 * Canonical UI data source — Right Panel.
 * All new UI components must use this endpoint for runs, assets, and missions.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildRightPanelData } from "@/lib/ui/right-panel/aggregate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const threadId = req.nextUrl.searchParams.get("thread_id") ?? undefined;
    const data = await buildRightPanelData(threadId);
    return NextResponse.json(data);
  } catch (e) {
    console.error("GET /api/v2/right-panel: uncaught", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
