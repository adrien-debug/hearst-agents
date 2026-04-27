/**
 * POST /api/dev/wipe-caches
 *
 * Dev-only endpoint that empties every in-process Map the orchestrator
 * keeps for fallback reads (assets, actions, missions, runs, planner).
 * Supabase wipe handles persisted state; this handles the running
 * Next.js server's caches that would otherwise serve ghost rows.
 *
 * Gated on HEARST_DEV_AUTH_BYPASS=1 — refuses otherwise.
 */

import { NextResponse } from "next/server";
import { clearAllAssetCaches } from "@/lib/assets/types";
import { clearAllAssets } from "@/lib/engine/runtime/assets/create-asset";
import { clearAllMissions } from "@/lib/engine/runtime/missions/store";
import { clearAllRuns } from "@/lib/engine/runtime/runs/store";
import { clearAllPlannerStores } from "@/lib/engine/planner/store";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.HEARST_DEV_AUTH_BYPASS !== "1") {
    return NextResponse.json(
      { error: "dev_only — set HEARST_DEV_AUTH_BYPASS=1 to use this endpoint" },
      { status: 403 },
    );
  }

  clearAllAssetCaches();
  clearAllAssets();
  clearAllMissions();
  clearAllRuns();
  clearAllPlannerStores();

  console.log("[dev/wipe-caches] in-memory stores cleared (assets, actions, missions, runs, planner)");

  return NextResponse.json({
    ok: true,
    wiped: {
      assetCache: 0,
      actionCache: 0,
      assetStore: 0,
      missionStore: 0,
      runStore: 0,
      plannerStore: 0,
    },
  });
}
