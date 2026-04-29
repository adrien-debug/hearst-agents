import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getBotStatus } from "@/lib/capabilities/providers/recall-ai";
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

  try {
    const { status, videoUrl, transcript } = await getBotStatus(id);

    let actionItems: ActionItem[] = [];
    if (transcript && transcript.trim().length > 0) {
      actionItems = await withTimeout(
        extractActionItems(transcript),
        8_000,
        [] as ActionItem[],
      );
    }

    return NextResponse.json({
      status,
      transcript: transcript ?? "",
      actionItems,
      videoUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "meeting_status_failed", message },
      { status: 500 },
    );
  }
}
