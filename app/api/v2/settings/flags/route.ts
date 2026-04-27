/**
 * GET  /api/v2/settings/flags — get feature flags for current scope
 * POST /api/v2/settings/flags — toggle a feature flag (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import {
  getFeatureFlag,
  setFeatureFlag,
  getCategorySettings,
} from "@/lib/platform/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const { scope, error } = await requireScope({ context: "GET /api/v2/settings/flags" });
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const db = requireServerSupabase();
  try {
    const flags = await getCategorySettings(db, "feature_flags", scope.tenantId);
    return NextResponse.json({ flags });
  } catch (e) {
    console.error("[Settings API] GET /flags error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({ context: "POST /api/v2/settings/flags" });
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const db = requireServerSupabase();

  try {
    const { key, enabled } = await req.json();

    if (!key || typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "key (string) and enabled (boolean) are required" },
        { status: 400 }
      );
    }

    await setFeatureFlag(db, key, enabled, scope.userId);
    const current = await getFeatureFlag(db, key, scope.tenantId);
    return NextResponse.json({ key, enabled: current });
  } catch (e) {
    console.error("[Settings API] POST /flags error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
