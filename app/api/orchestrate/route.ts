import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { getUserId } from "@/lib/get-user-id";
import { orchestrateV2 } from "@/lib/orchestrator/entry";
import { ensureSchedulerStarted } from "@/lib/runtime/missions/scheduler-init";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Start the mission scheduler exactly once (module scope, survives hot-reload).
// Primary boot is instrumentation.ts; this is a secondary guard.
void ensureSchedulerStarted();

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return new Response(
      JSON.stringify({ ok: false, error: "not_authenticated" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: {
    message: string;
    conversation_id?: string;
    surface?: string;
    thread_id?: string;
    focal_context?: { id: string; objectType: string; title: string; status: string };
    history?: Array<{ role: "user" | "assistant"; content: string }>;
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
    userId,
    message: body.message,
    conversationId: body.conversation_id,
    surface: body.surface,
    threadId: body.thread_id,
    focalContext: body.focal_context,
    conversationHistory: body.history,
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
