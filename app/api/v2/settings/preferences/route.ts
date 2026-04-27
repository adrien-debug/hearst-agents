/**
 * GET  /api/v2/settings/preferences — get user preferences
 * POST /api/v2/settings/preferences — update a user preference
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import {
  getUserPreference,
  setUserPreference,
  getUserTheme,
  getUserLocale,
  getUserNotificationPrefs,
} from "@/lib/platform/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const { scope, error } = await requireScope({ context: "GET /api/v2/settings/preferences" });
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const db = requireServerSupabase();

  try {
    const [theme, locale, notifications] = await Promise.all([
      getUserTheme(db, scope.userId),
      getUserLocale(db, scope.userId),
      getUserNotificationPrefs(db, scope.userId),
    ]);

    return NextResponse.json({
      preferences: { theme, locale, notifications },
    });
  } catch (e) {
    console.error("[Settings API] GET /preferences error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({ context: "POST /api/v2/settings/preferences" });
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const db = requireServerSupabase();

  try {
    const { key, value } = await req.json();

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: "key and value are required" },
        { status: 400 }
      );
    }

    await setUserPreference(db, scope.userId, key, value);
    const current = await getUserPreference(db, scope.userId, key, value);
    return NextResponse.json({ key, value: current });
  } catch (e) {
    console.error("[Settings API] POST /preferences error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
