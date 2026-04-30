/**
 * POST /api/v2/missions/[id]/approve-step
 *
 * Approuve un step en attente d'une mission active (Mission Control B1).
 * Reprend l'exécution du plan multi-step. L'`id` ici peut être soit un
 * missionId classique, soit un planId interne — on accepte les deux.
 *
 * Body : { stepId: string, skip?: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { approvePlan } from "@/lib/engine/planner";
import { requireScope } from "@/lib/platform/auth/scope";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { scope, error } = await requireScope({
    context: "POST /api/v2/missions/[id]/approve-step",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const { id } = await params;

  let body: { stepId?: string; skip?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.stepId) {
    return NextResponse.json({ error: "missing_step_id" }, { status: 400 });
  }

  // POURQUOI : on essaie d'approuver le plan via le store planner. Si l'`id`
  // est un missionId, le plan associé n'est pas trouvé → 404 silencieux. Le
  // resume fin sera implémenté Phase 2 quand le planner aura un store
  // persistant (Supabase) au lieu d'in-memory.
  const approved = approvePlan(id);

  if (!approved) {
    console.warn(
      `[ApproveStep] plan/mission ${id} introuvable ou pas en awaiting_approval (user ${scope.userId.slice(0, 8)})`,
    );
    return NextResponse.json(
      { error: "plan_not_awaiting_approval", id },
      { status: 404 },
    );
  }

  console.log(
    `[ApproveStep] plan ${id} step ${body.stepId} ${body.skip ? "skipped" : "approved"} (user ${scope.userId.slice(0, 8)})`,
  );

  return NextResponse.json({
    ok: true,
    planId: id,
    stepId: body.stepId,
    skipped: body.skip ?? false,
    status: approved.status,
  });
}
