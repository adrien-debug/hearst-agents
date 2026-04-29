/**
 * POST /api/v2/voice/tool-call
 *
 * Exécute une function call émise par OpenAI Realtime côté browser.
 * Le client (VoicePulse) a reçu un event `response.function_call_arguments.done`
 * via le DataChannel "oai-events", parse les args, POST ici, puis renvoie
 * l'output au modèle via `conversation.item.create` (function_call_output).
 *
 * Body : { name: string, args: Record<string, unknown> }
 * Response : { output: string, stageRequest?: StagePayload }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { executeVoiceTool } from "@/lib/voice/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { scope, error: scopeError } = await requireScope({
    context: "POST /api/v2/voice/tool-call",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  let body: { name?: unknown; args?: unknown };
  try {
    body = (await req.json()) as { name?: unknown; args?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  const args =
    body.args && typeof body.args === "object" && !Array.isArray(body.args)
      ? (body.args as Record<string, unknown>)
      : {};
  if (!name) {
    return NextResponse.json({ error: "missing_name" }, { status: 400 });
  }

  try {
    const result = await executeVoiceTool({ name, args, scope });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[voice/tool-call] error:", message);
    return NextResponse.json(
      { error: "tool_failed", output: `Erreur: ${message}` },
      { status: 500 },
    );
  }
}
