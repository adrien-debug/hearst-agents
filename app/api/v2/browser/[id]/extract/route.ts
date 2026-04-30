/**
 * POST /api/v2/browser/[id]/extract — Extraction structurée via Stagehand.
 *
 * Body : `{ instruction: string, schema: Record<string,unknown> }`. On lance
 * une mini-task d'extraction one-shot (pas de plan), persiste le résultat
 * comme asset JSON (kind="extract") et retourne `{ assetId, data }`.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { runBrowserTask } from "@/lib/browser/stagehand-executor";
import { persistExtraction } from "@/lib/browser/screenshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const { scope, error } = await requireScope({
    context: "POST /api/v2/browser/[id]/extract",
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

  let body: { instruction?: string; schema?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const instruction = (body.instruction ?? "").trim();
  if (!instruction) {
    return NextResponse.json({ error: "instruction_required" }, { status: 400 });
  }

  try {
    const result = await runBrowserTask({
      sessionId: id,
      task: instruction,
      extractInstruction: instruction,
      extractSchema: body.schema,
      maxActions: 5,
    });

    const asset = await persistExtraction(id, result.extractData, scope, {
      instruction,
      schema: body.schema,
    });

    return NextResponse.json({
      assetId: asset.id,
      data: result.extractData,
      totalActions: result.totalActions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[BrowserExtract] failed:", message);
    return NextResponse.json(
      { error: "extract_failed", message },
      { status: 502 },
    );
  }
}
