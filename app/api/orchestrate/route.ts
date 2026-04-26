import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { orchestrateV2 } from "@/lib/engine/orchestrator/entry";
import { ensureSchedulerStarted } from "@/lib/engine/runtime/missions/scheduler-init";
import { requireScope } from "@/lib/scope";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Start the mission scheduler exactly once (module scope, survives hot-reload).
// Primary boot is instrumentation.ts; this is a secondary guard.
void ensureSchedulerStarted();

export async function POST(req: NextRequest) {
  // Resolve full scope (userId + tenantId + workspaceId) via canonical scope resolver
  const { scope, error } = await requireScope({ context: "POST /api/orchestrate" });
  if (error || !scope) {
    return new Response(
      JSON.stringify({ ok: false, error: error?.message ?? "not_authenticated" }),
      { status: error?.status ?? 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: {
    message: string;
    conversation_id?: string;
    surface?: string;
    thread_id?: string;
    focal_context?: { id: string; objectType: string; title: string; status: string };
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    // Note: mission_id est intentionnellement absent — les runs mission passent par POST /api/v2/missions/[id]/run
  };

  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "invalid_json" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!body.message || typeof body.message !== "string") {
    return new Response(
      JSON.stringify({ ok: false, error: "message_required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = requireServerSupabase();

  const stream = orchestrateV2(db, {
    userId: scope.userId,
    message: body.message,
    conversationId: body.conversation_id,
    surface: body.surface,
    threadId: body.thread_id,
    focalContext: body.focal_context,
    conversationHistory: body.history,
    // missionId n'est pas accepté depuis le chat public — ownership validé via /api/v2/missions/[id]/run
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
