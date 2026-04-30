/**
 * POST /api/v2/missions/[id]/replay-step
 *
 * Re-exécute un step précis d'un plan multi-step en mode "append-after" :
 * on duplique le step ciblé avec un nouvel id en fin de plan, statut "pending"
 * + dependsOn vide → il sera ré-exécuté au prochain tick de l'executor sans
 * altérer la timeline originale (le step source garde son status terminal).
 *
 * Body : { stepId: string }
 *
 * Limitation connue (in-memory store) :
 *   Le PlanStore actuel est in-memory (lib/engine/planner/store.ts). Le replay
 *   est donc valide uniquement pour la durée de vie du process Node — un
 *   redéploiement perd le plan. La migration Supabase est traquée comme TODO
 *   dans le store. En attendant, le replay est suffisant pour les flows
 *   one-shot dans le même process (mission control inline).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getPlan, savePlan } from "@/lib/engine/planner/store";
import type { ExecutionPlanStep } from "@/lib/engine/planner/types";

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

  // Append-after : on clone le step en preserve la timeline source.
  const newStepId = `${step.id}_replay_${Date.now()}`;
  const cloned: ExecutionPlanStep = {
    id: newStepId,
    kind: step.kind,
    title: `${step.title} (rejoué)`,
    capability: step.capability,
    tool: step.tool,
    providerId: step.providerId,
    dependsOn: [],
    risk: step.risk,
    expectedOutput: step.expectedOutput,
    status: "pending",
  };

  plan.steps.push(cloned);
  // Re-active le plan si terminal pour que l'executor le reprenne au prochain tick.
  if (plan.status === "completed" || plan.status === "failed" || plan.status === "degraded") {
    plan.status = "ready";
  }
  plan.updatedAt = Date.now();
  savePlan(plan);

  console.log(
    `[ReplayStep] plan ${id} step ${body.stepId} cloned as ${newStepId} (user ${scope.userId.slice(0, 8)})`,
  );

  return NextResponse.json({
    ok: true,
    planId: id,
    stepId: body.stepId,
    newStepId,
    status: "queued",
    message: "Step rejoué en append-after. Sera exécuté au prochain tick.",
  });
}
