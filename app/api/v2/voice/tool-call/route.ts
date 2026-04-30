/**
 * POST /api/v2/voice/tool-call
 *
 * Exécute une function call émise par OpenAI Realtime côté browser.
 * Le client (VoicePulse) a reçu un event `response.function_call_arguments.done`
 * via le DataChannel "oai-events", parse les args, POST ici, puis renvoie
 * l'output au modèle via `conversation.item.create` (function_call_output).
 *
 * Body : {
 *   name: string,
 *   args: Record<string, unknown>,
 *   callId?: string,        // sert à apparier tool_call ↔ tool_result en transcript
 *   sessionId?: string,     // pour persister dans voice_transcripts
 *   threadId?: string,      // optionnel, lie au thread chat
 * }
 * Response : {
 *   output: string,
 *   stageRequest?: StagePayload,
 *   providerId?: string,
 *   latencyMs?: number,
 *   costUsd?: number,
 *   status?: "success" | "error",
 * }
 *
 * Side effect : persiste deux entries (tool_call pré-exec + tool_result
 * post-exec) dans voice_transcripts, append-only, scope user/tenant via
 * RLS migration 0045.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireScope } from "@/lib/platform/auth/scope";
import { executeVoiceTool } from "@/lib/voice/tools";
import { appendTranscriptEntry } from "@/lib/voice/transcript-store";

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

  let body: {
    name?: unknown;
    args?: unknown;
    callId?: unknown;
    sessionId?: unknown;
    threadId?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  const args =
    body.args && typeof body.args === "object" && !Array.isArray(body.args)
      ? (body.args as Record<string, unknown>)
      : {};
  const callId = typeof body.callId === "string" ? body.callId : undefined;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
  const threadId = typeof body.threadId === "string" ? body.threadId : undefined;

  if (!name) {
    return NextResponse.json({ error: "missing_name" }, { status: 400 });
  }

  // 1. Persiste la tool_call entry (pending) AVANT l'exec — l'UI peut
  //    déjà afficher le receipt en pending pendant qu'on appelle Composio.
  if (sessionId) {
    void appendTranscriptEntry({
      sessionId,
      userId: scope.userId,
      tenantId: scope.tenantId,
      threadId: threadId ?? null,
      entry: {
        id: callId ?? `tc-${randomUUID()}`,
        role: "tool_call",
        text: name,
        toolName: name,
        callId,
        args,
        status: "pending",
        timestamp: Date.now(),
      },
    });
  }

  try {
    const result = await executeVoiceTool({ name, args, scope });

    // 2. Persiste la tool_result entry (success/error) avec providerId/latency.
    if (sessionId) {
      void appendTranscriptEntry({
        sessionId,
        userId: scope.userId,
        tenantId: scope.tenantId,
        threadId: threadId ?? null,
        entry: {
          id: `tr-${callId ?? randomUUID()}`,
          role: "tool_result",
          text: result.output,
          toolName: name,
          callId,
          output: result.output,
          status: result.status ?? "success",
          providerId: result.providerId,
          timestamp: Date.now(),
        },
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[voice/tool-call] error:", message);

    if (sessionId) {
      void appendTranscriptEntry({
        sessionId,
        userId: scope.userId,
        tenantId: scope.tenantId,
        threadId: threadId ?? null,
        entry: {
          id: `tr-${callId ?? randomUUID()}`,
          role: "tool_result",
          text: `Erreur: ${message}`,
          toolName: name,
          callId,
          output: `Erreur: ${message}`,
          status: "error",
          timestamp: Date.now(),
        },
      });
    }

    return NextResponse.json(
      { error: "tool_failed", output: `Erreur: ${message}`, status: "error" },
      { status: 500 },
    );
  }
}
