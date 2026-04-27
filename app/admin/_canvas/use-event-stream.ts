"use client";

import { useEffect } from "react";
import { reduceEvent } from "./event-reducer";
import { useCanvasStore } from "./store";

/**
 * Tail the global event stream when `enabled`. Each event is fed through the
 * reducer and applied to the canvas store.
 *
 * Uses fetch + ReadableStream (same pattern as `app/(user)/page.tsx`) rather
 * than EventSource so we share one parser implementation across the codebase.
 */
export function useEventStream(enabled: boolean) {
  const setNodeState = useCanvasStore((s) => s.setNodeState);
  const emitPacket = useCanvasStore((s) => s.emitPacket);
  const resetNodes = useCanvasStore((s) => s.resetNodes);
  const setLastEventAt = useCanvasStore((s) => s.setLastEventAt);

  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    let buffer = "";

    (async () => {
      try {
        const res = await fetch("/api/admin/events-stream", { signal: ac.signal });
        if (!res.ok || !res.body) {
          console.error("[useEventStream] HTTP", res.status);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event?.type === "stream_open") continue;
              const ops = reduceEvent(event);
              for (const op of ops) {
                if (op.kind === "reset") resetNodes();
                else if (op.kind === "node") setNodeState(op.id, op.state);
                else if (op.kind === "packet") emitPacket(op.edgeId);
              }
              if (typeof event.timestamp === "string") {
                setLastEventAt(new Date(event.timestamp).getTime());
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch (e: unknown) {
        if ((e as { name?: string })?.name === "AbortError") return;
        console.error("[useEventStream] error:", e);
      }
    })();

    return () => ac.abort();
  }, [enabled, setNodeState, emitPacket, resetNodes, setLastEventAt]);
}
