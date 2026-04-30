/**
 * POST /api/v2/runs/[id]/rerun — Stub : enqueue un re-run du run cible.
 *
 * Phase A : retourne un payload `{ ok, queuedRunId }` factice (l'orchestrateur
 * réel sera branché plus tard). Permet à l'UI /runs (RowActions) d'avoir un
 * endpoint stable et un retour testable.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1, "id_required") });

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { scope, error } = await requireScope({ context: "POST /api/v2/runs/[id]/rerun" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const raw = await params;
  const parsed = ParamsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_params", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Stub : pas d'orchestrateur branché. On renvoie un id factice cohérent
  // avec le pattern attendu par l'UI (openable mais qui n'aura pas de
  // timeline tant que la file n'est pas câblée).
  const queuedRunId = `${parsed.data.id}-rerun-${Date.now().toString(36)}`;

  return NextResponse.json({
    ok: true,
    queuedRunId,
    sourceRunId: parsed.data.id,
    requestedBy: scope.userId,
  });
}
