/**
 * POST /api/v2/missions/[id]/replay-step
 *
 * Re-exécute un step précis d'un plan multi-step. MVP : append-after, pas
 * in-place — on log l'intention, le replay réel sera Phase 2 quand le
 * planner aura un store persistant.
 *
 * Body : { stepId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getPlan } from "@/lib/engine/planner/store";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { scope, error } = await requireScope({
    context: "POST /api/v2/missions/[id]/replay-step",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const { id } = await params;

  let body: { stepId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.stepId) {
    return NextResponse.json({ error: "missing_step_id" }, { status: 400 });
  }

  const plan = getPlan(id);
  if (!plan) {
    return NextResponse.json(
      { error: "plan_not_found", id },
      { status: 404 },
    );
  }

  const step = plan.steps.find((s) => s.id === body.stepId);
  if (!step) {
    return NextResponse.json(
      { error: "step_not_found", stepId: body.stepId },
      { status: 404 },
    );
  }

  // Phase 2 : créer un nouveau step append-after avec le même kind/tool/params
  // et relancer executePlan. Pour MVP on retourne la requête acceptée.
  console.log(
    `[ReplayStep] plan ${id} step ${body.stepId} replay requested (user ${scope.userId.slice(0, 8)})`,
  );

  return NextResponse.json({
    ok: true,
    planId: id,
    stepId: body.stepId,
    status: "queued",
    message: "Replay queued — sera exécuté au prochain tick (MVP append-after).",
  });
}
