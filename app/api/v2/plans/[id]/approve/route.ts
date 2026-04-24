/**
 * POST /api/v2/plans/[id]/approve
 *
 * Approve a plan awaiting approval and resume execution.
 * Returns the updated focal object after execution.
 */

import { NextRequest, NextResponse } from "next/server";
import { approvePlan } from "@/lib/planner/index";
import { approveAndResume, PipelineContext } from "@/lib/planner/pipeline";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const planId = (await params).id;

  try {
    // Get request body for context
    const body = await request.json().catch(() => ({}));
    const { threadId, userId, tenantId, connectedProviders = [], forcedProviderId } = body;

    if (!threadId || !userId) {
      return NextResponse.json(
        { error: "Missing required context: threadId, userId" },
        { status: 400 }
      );
    }

    // First, approve the plan
    const approvedPlan = approvePlan(planId);
    if (!approvedPlan) {
      console.warn(`[Plans API] Plan not found or not awaiting approval: ${planId}`);
      return NextResponse.json(
        { error: "Plan not found or not awaiting approval" },
        { status: 404 }
      );
    }

    console.log(`[Plans API] Plan approved: ${planId}, type: ${approvedPlan.type}`);

    // Build pipeline context
    const ctx: PipelineContext = {
      userId,
      tenantId: tenantId ?? "default",
      threadId,
      connectedProviders,
      forcedProviderId,
    };

    // Resume execution with the approved plan
    const result = await approveAndResume(planId, ctx, (event, data) => {
      console.log(`[Plans API] Pipeline event: ${event}`, data);
    });

    // Return the focal object produced by execution
    return NextResponse.json({
      success: true,
      planId: result.plan.id,
      planStatus: result.plan.status,
      focalObject: result.focalObject,
      assets: result.assets.map(a => ({
        id: a.id,
        kind: a.kind,
        title: a.title,
      })),
    });

  } catch (error) {
    console.error(`[Plans API] Error approving plan ${planId}:`, error);
    return NextResponse.json(
      { error: "Failed to approve plan", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
