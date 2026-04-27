/**
 * GET /api/admin/events-stream — SSE proxy of the global run bus.
 *
 * Tails every event emitted by every run in this process. Used by the admin
 * canvas to animate the pipeline in real time.
 */

import { NextRequest } from "next/server";
import { requireAdmin, isError } from "../_helpers";
import { globalRunBus } from "@/lib/events/global-bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin("GET /api/admin/events-stream", { resource: "runs", action: "read" });
  if (isError(guard)) return guard;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const safeEnqueue = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // controller closed, ignored
        }
      };

      safeEnqueue(`data: ${JSON.stringify({ type: "stream_open" })}\n\n`);

      // Replay the ring buffer so a late-attaching client sees recent context.
      for (const event of globalRunBus.getRecent()) {
        safeEnqueue(`data: ${JSON.stringify(event)}\n\n`);
      }

      const unsubscribe = globalRunBus.subscribe((event) => {
        safeEnqueue(`data: ${JSON.stringify(event)}\n\n`);
      });

      // Keep-alive every 15 s — defends against idle timeouts on proxies.
      const heartbeat = setInterval(() => {
        safeEnqueue(`: ping\n\n`);
      }, 15000);

      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
