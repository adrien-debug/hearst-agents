/**
 * POST /api/v2/browser/[id]/execute — Lance une tâche autonome sur la session.
 *
 * Le client poste `{ task, schema?, instruction?, takeOverOnComplete? }`.
 * On démarre l'executor en arrière-plan et on retourne immédiatement un
 * `taskId` ; les events `browser_action` / `browser_task_completed` sont
 * streamés via le bus global (consommé par /api/admin/events-stream).
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { runBrowserTask, clearUserControlled } from "@/lib/browser/stagehand-executor";
import {
  persistExtraction,
  persistSessionReport,
} from "@/lib/browser/screenshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const { scope, error } = await requireScope({
    context: "POST /api/v2/browser/[id]/execute",
  });
  if (error || !scope) {
    return NextResponse.json(
      { error: error?.message ?? "not_authenticated" },
      { status: error?.status ?? 401 },
    );
  }

  if (!id?.trim()) {
    return NextResponse.json({ error: "session_id_required" }, { status: 400 });
  }

  if (!process.env.BROWSERBASE_API_KEY) {
    return NextResponse.json(
      { error: "browserbase_unavailable" },
      { status: 503 },
    );
  }

  let body: {
    task?: string;
    instruction?: string;
    schema?: Record<string, unknown>;
    maxActions?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const task = (body.task ?? "").trim();
  if (!task) {
    return NextResponse.json({ error: "task_required" }, { status: 400 });
  }

  // Reset l'état "user-controlled" pour cette session — la nouvelle tâche
  // reprend la main.
  clearUserControlled(id);

  const taskId = randomUUID();

  // Fire & forget : on lance la tâche en background, on retourne le taskId
  // pour que le client puisse subscribe au stream global et filtrer sur
  // sessionId. Les erreurs sont émises via `browser_task_failed`.
  void (async () => {
    try {
      const result = await runBrowserTask({
        sessionId: id,
        task,
        runId: taskId,
        extractInstruction: body.instruction,
        extractSchema: body.schema,
        maxActions: body.maxActions,
      });

      // Si extraction demandée, persiste l'asset.
      const assetIds: string[] = [];
      if (body.instruction && result.extractData !== undefined) {
        const extractAsset = await persistExtraction(
          id,
          result.extractData,
          scope,
          { instruction: body.instruction, schema: body.schema },
        );
        assetIds.push(extractAsset.id);
      }

      await persistSessionReport(id, scope, {
        summary: result.summary,
        totalActions: result.totalActions,
        totalDurationMs: result.totalDurationMs,
        assetIds,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[BrowserExecute] task ${taskId} failed:`,
        message,
      );
    }
  })();

  return NextResponse.json({ taskId, sessionId: id, status: "running" });
}
