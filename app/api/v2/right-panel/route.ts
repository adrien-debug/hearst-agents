/**
 * Canonical UI data source — Right Panel.
 * All new UI components must use this endpoint for runs, assets, and missions.
 */
import { NextResponse } from "next/server";
import { buildRightPanelData } from "@/lib/ui/right-panel/aggregate";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await buildRightPanelData();
    return NextResponse.json(data);
  } catch (e) {
    console.error("GET /api/v2/right-panel: uncaught", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
