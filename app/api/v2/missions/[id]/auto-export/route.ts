/**
 * PATCH /api/v2/missions/[id]/auto-export
 *
 * Active / désactive / reconfigure l'export automatique d'une mission schedulée.
 *
 * Body :
 *   { enabled: boolean; format: "pdf" | "excel"; recipients: string[]; reportId: string }
 *
 * Protégé par session/tenant via requireScope.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getMission } from "@/lib/engine/runtime/missions/store";
import { updateScheduledMission } from "@/lib/engine/runtime/state/adapter";
import { autoExportConfigSchema } from "@/lib/engine/runtime/missions/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { scope, error } = await requireScope({
    context: "PATCH /api/v2/missions/[id]/auto-export",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const { id: missionId } = await params;

  // ── Vérification de propriété ────────────────────────────
  const mission = getMission(missionId);
  if (mission && mission.userId && mission.userId !== scope.userId) {
    console.warn(
      `[AutoExport] Access denied — user mismatch for mission ${missionId}`,
    );
    return NextResponse.json({ error: "mission_not_found" }, { status: 404 });
  }

  // ── Parse + validation du body ───────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = autoExportConfigSchema.safeParse(rawBody);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    return NextResponse.json(
      { error: "validation_failed", issues },
      { status: 422 },
    );
  }

  const autoExport = parsed.data;

  // ── Mise à jour en mémoire ───────────────────────────────
  if (mission) {
    mission.autoExport = autoExport;
  }

  // ── Persistance Supabase ─────────────────────────────────
  // On stocke autoExport dans la colonne metadata (jsonb) de la table missions.
  // Si la colonne n'existe pas encore, l'update est no-op côté DB mais l'état
  // in-memory reste correct pour le scheduler.
  const dbResult = await updateScheduledMission(missionId, {
    metadata: { autoExport },
  } as Record<string, unknown>).catch((err) => {
    console.error(`[AutoExport] DB update failed for mission ${missionId}:`, err);
    return null;
  });

  console.log(
    `[AutoExport] Mission ${missionId} auto-export updated — enabled=${autoExport.enabled} format=${autoExport.format} recipients=${autoExport.recipients.length} (user: ${scope.userId.slice(0, 8)})`,
  );

  return NextResponse.json({
    ok: true,
    missionId,
    autoExport,
    persisted: dbResult !== null,
  });
}
