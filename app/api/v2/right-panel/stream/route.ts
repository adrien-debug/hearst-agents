/**
 * Right Panel — Server-Sent Events (live updates)
 *
 * Pushes the same payload shape as GET /api/v2/right-panel on an interval.
 * Client: EventSource with event name "panel".
 */

import { NextRequest, NextResponse } from "next/server";
import { buildRightPanelData } from "@/lib/ui/right-panel/aggregate";
import { requireScope } from "@/lib/platform/auth/scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PANEL_INTERVAL_MS = 1000;
const PING_INTERVAL_MS = 25000;

export async function GET(req: NextRequest) {
  const { scope, error } = await requireScope({ context: "GET /api/v2/right-panel/stream" });
  if (error || !scope) {
    return NextResponse.json(
      { error: error?.message ?? "not_authenticated" },
      { status: error?.status ?? 401 },
    );
  }

  const threadId = req.nextUrl.searchParams.get("thread_id") ?? undefined;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let stopped = false;
      let panelTimer: ReturnType<typeof setInterval> | null = null;
      let pingTimer: ReturnType<typeof setInterval> | null = null;

      const closeAll = () => {
        if (stopped) return;
        stopped = true;
        if (panelTimer) clearInterval(panelTimer);
        if (pingTimer) clearInterval(pingTimer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", closeAll);

      const enqueue = (chunk: Uint8Array) => {
        if (stopped || req.signal.aborted) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closeAll();
        }
      };

      const sendPanel = async () => {
        if (stopped || req.signal.aborted) return;
        try {
          const data = await buildRightPanelData(threadId, {
            userId: scope.userId,
            tenantId: scope.tenantId,
            workspaceId: scope.workspaceId,
          });
          // Re-check after async work — client may have disconnected during await
          if (stopped || req.signal.aborted) return;
          const payload = JSON.stringify({
            ...data,
            scope: { isDevFallback: scope.isDevFallback },
          });
          enqueue(encoder.encode(`event: panel\ndata: ${payload}\n\n`));
        } catch (e) {
          if (stopped || req.signal.aborted) return;
          console.error("[GET /api/v2/right-panel/stream] buildRightPanelData failed:", e);
          enqueue(
            encoder.encode(
              `event: stream_error\ndata: ${JSON.stringify({ message: "internal_error" })}\n\n`,
            ),
          );
        }
      };

      await sendPanel();

      panelTimer = setInterval(() => {
        void sendPanel();
      }, PANEL_INTERVAL_MS);

      pingTimer = setInterval(() => {
        if (stopped || req.signal.aborted) {
          closeAll();
          return;
        }
        enqueue(encoder.encode(":\n\n"));
      }, PING_INTERVAL_MS);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
