/**
 * GET  /api/settings/alerting — charge les préférences alerting du tenant.
 * PUT  /api/settings/alerting — sauvegarde (validation Zod).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import {
  loadAlertingPreferences,
  saveAlertingPreferences,
} from "@/lib/notifications/alert-dispatcher";
import { alertingPreferencesSchema } from "@/lib/notifications/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const { scope, error } = await requireScope({ context: "settings/alerting GET" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const db = requireServerSupabase();
  const prefs = await loadAlertingPreferences(db, scope.tenantId);

  return NextResponse.json({ prefs });
}

export async function PUT(req: NextRequest) {
  const { scope, error } = await requireScope({ context: "settings/alerting PUT" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const parsed = alertingPreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation échouée", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const db = requireServerSupabase();
  await saveAlertingPreferences(db, scope.tenantId, parsed.data, scope.userId);

  return NextResponse.json({ ok: true, prefs: parsed.data });
}
