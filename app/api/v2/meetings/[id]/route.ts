/**
 * GET /api/v2/meetings/[id]   → state polling (status + transcript + actions)
 * DELETE /api/v2/meetings/[id] → arrête le bot (leave_call) + cleanup ressource
 *
 * Le polling est utilisé par MeetingStage pendant la session — toutes les 5s
 * côté UI. On essaie d'abord `getTranscript` (segments avec speakers), puis
 * fallback `getBotStatus.transcript` si l'endpoint dédié n'est pas dispo.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import {
  getBotStatus,
  getTranscript,
  isRecallAiConfigured,
  stopBot,
  deleteBot,
  RecallAiUnavailableError,
} from "@/lib/capabilities/providers/recall-ai";
import { extractActionItems } from "@/lib/capabilities/providers/deepgram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActionItem = { action: string; owner?: string; deadline?: string };

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race<T>([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const { scope, error: scopeError } = await requireScope({
    context: "GET /api/v2/meetings/[id]",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  if (!id) {
    return NextResponse.json({ error: "meeting_id_required" }, { status: 400 });
  }

  if (!isRecallAiConfigured()) {
    return NextResponse.json(
      { error: "recall_ai_unavailable", message: "RECALL_API_KEY non configuré" },
      { status: 503 },
    );
  }

  try {
    const status = await getBotStatus(id);

    let transcript = status.transcript ?? "";
    let segments: Array<{ speaker: string | number; text: string; start: number; end: number }> = [];
    try {
      const detail = await getTranscript(id);
      if (detail.transcript) {
        transcript = detail.transcript;
      }
      segments = detail.segments;
    } catch {
      // fallback déjà géré par getTranscript pour 404 ; ignorer autres erreurs
    }

    let actionItems: ActionItem[] = [];
    if (transcript.trim().length > 0) {
      actionItems = await withTimeout(
        extractActionItems(transcript),
        8_000,
        [] as ActionItem[],
      );
    }

    return NextResponse.json({
      meetingId: id,
      status: status.status,
      transcript,
      segments,
      actionItems,
      videoUrl: status.videoUrl,
      recordingUrl: status.videoUrl,
    });
  } catch (err) {
    if (err instanceof RecallAiUnavailableError) {
      return NextResponse.json(
        { error: "recall_ai_unavailable", message: err.message },
        { status: 503 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "meeting_status_failed", message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const { scope, error: scopeError } = await requireScope({
    context: "DELETE /api/v2/meetings/[id]",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  if (!id) {
    return NextResponse.json({ error: "meeting_id_required" }, { status: 400 });
  }

  if (!isRecallAiConfigured()) {
    return NextResponse.json(
      { error: "recall_ai_unavailable", message: "RECALL_API_KEY non configuré" },
      { status: 503 },
    );
  }

  try {
    await stopBot(id);
  } catch (err) {
    console.warn(
      "[meetings/DELETE] stopBot failed:",
      err instanceof Error ? err.message : err,
    );
  }

  // deleteBot fire-and-forget — pas critique si ça échoue.
  void deleteBot(id).catch(() => {});

  return NextResponse.json({ ok: true, meetingId: id, status: "stopping" });
}
