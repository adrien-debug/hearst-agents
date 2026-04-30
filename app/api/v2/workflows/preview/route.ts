/**
 * Workflow Preview — dry-run d'un graphe.
 *
 * Reçoit un graphe en POST, l'exécute en mode preview (pas d'effet de bord
 * réel sur les tools), retourne la liste des events SSE-like collectés.
 *
 * Pour le streaming live le client peut consommer la route `/api/runs/:id/stream`
 * existante après avoir démarré un mission run avec workflowGraph. Cette
 * route preview est volontairement synchrone pour rester simple.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { executeWorkflow } from "@/lib/workflows/executor";
import { validateGraph } from "@/lib/workflows/validate";
import type {
  WorkflowExecutionContext,
  WorkflowExecutorEvent,
  WorkflowGraph,
} from "@/lib/workflows/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({
    context: "POST /api/v2/workflows/preview",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  let body: { graph?: WorkflowGraph };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.graph) {
    return NextResponse.json({ error: "graph_required" }, { status: 400 });
  }

  const validation = validateGraph(body.graph);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "invalid_graph", details: validation.errors },
      { status: 400 },
    );
  }

  const events: WorkflowExecutorEvent[] = [];
  const context: WorkflowExecutionContext = {
    userId: scope.userId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    runId: `preview_${Date.now()}`,
    preview: true,
    outputs: new Map(),
  };

  try {
    const result = await executeWorkflow(
      body.graph,
      context,
      {
        executeTool: async (tool, args) => ({
          success: true,
          output: { preview: true, tool, args },
        }),
        emitEvent: (e) => events.push(e),
      },
      { maxNodes: 50 },
    );

    return NextResponse.json({
      ok: true,
      result: {
        status: result.status,
        visitedCount: result.visitedCount,
        outputs: result.outputs,
        awaitingNodeId: result.awaitingNodeId,
        error: result.error,
      },
      events,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[WorkflowsPreview] uncaught", err);
    return NextResponse.json(
      { error: "preview_failed", message },
      { status: 500 },
    );
  }
}
