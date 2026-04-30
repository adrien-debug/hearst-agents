import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { orchestrate } from "@/lib/engine/orchestrator";
import { ensureSchedulerStarted } from "@/lib/engine/runtime/missions/scheduler-init";
import { requireScope } from "@/lib/platform/auth/scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// 300s = couvre les runs longs (research reports, browser tasks, video gen).
// Heartbeat 20s injecté dans le stream (voir withHeartbeat) pour tenir la
// connexion ouverte côté proxies et empêcher les timeouts intermédiaires.
export const maxDuration = 300;

const HEARTBEAT_INTERVAL_MS = 20_000;

/**
 * Wrap un ReadableStream SSE pour injecter `: heartbeat\n\n` toutes les 20s.
 *
 * Les commentaires SSE (lignes commençant par `:`) ne déclenchent aucun
 * handler côté client mais maintiennent la connexion vivante face aux
 * proxies (Cloudflare, Vercel, nginx) qui ferment les sockets idle au-delà
 * de ~30s. Belt-and-suspenders avec le heartbeat interne au SSEAdapter :
 * ce wrapper est le dernier rempart au niveau du Response.
 */
function withHeartbeat(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const reader = stream.getReader();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // Si le controller est fermé, on stop le timer pour éviter la fuite.
          stopHeartbeat();
        }
      }, HEARTBEAT_INTERVAL_MS);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch (err) {
        controller.error(err);
      } finally {
        stopHeartbeat();
        controller.close();
      }
    },
    cancel() {
      stopHeartbeat();
      void reader.cancel();
    },
  });
}

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
    /** B4 — assets droppés dans ChatInput. Le pipeline IA les injecte dans le contexte. */
    attached_asset_ids?: string[];
    /** C4 — persona explicite à appliquer à ce run. */
    persona_id?: string;
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

  const stream = orchestrate(db, {
    userId: scope.userId,
    message: body.message,
    conversationId: body.conversation_id,
    surface: body.surface,
    threadId: body.thread_id,
    focalContext: body.focal_context,
    conversationHistory: body.history,
    attachedAssetIds: body.attached_asset_ids,
    personaId: typeof body.persona_id === "string" && body.persona_id.length > 0 ? body.persona_id : undefined,
    // missionId n'est pas accepté depuis le chat public — ownership validé via /api/v2/missions/[id]/run
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
  });

  return new Response(withHeartbeat(stream), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
