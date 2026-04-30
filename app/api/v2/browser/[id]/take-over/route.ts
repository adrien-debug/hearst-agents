/**
 * POST /api/v2/browser/[id]/take-over — L'utilisateur reprend la main.
 *
 * Stoppe immédiatement toute tâche autonome en cours sur la session et
 * marque la session "user-controlled" — la BrowserStage affiche alors un
 * banner "Tu pilotes maintenant" sur l'iframe debug viewer.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import {
  requestTakeOver,
  markUserControlled,
} from "@/lib/browser/stagehand-executor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const { scope, error } = await requireScope({
    context: "POST /api/v2/browser/[id]/take-over",
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

  const stopped = requestTakeOver(id);
  markUserControlled(id);

  return NextResponse.json({
    sessionId: id,
    userControlled: true,
    stoppedRunningTask: stopped,
  });
}
