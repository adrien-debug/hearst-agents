import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireScope } from "@/lib/scope";
import { globalRunBus } from "@/lib/events/global-bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { error } = await requireScope({ context: "GET /api/admin/events-stream" });
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

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

      for (const event of globalRunBus.getRecent()) {
        safeEnqueue(`data: ${JSON.stringify(event)}\n\n`);
      }

      const unsubscribe = globalRunBus.subscribe((event) => {
        safeEnqueue(`data: ${JSON.stringify(event)}\n\n`);
      });

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
