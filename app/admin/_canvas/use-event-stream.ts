"use client";

import { useEffect } from "react";
import { reduceEvent } from "./event-reducer";
import { useCanvasStore } from "./store";

/**
 * Tail le global event stream quand `enabled`. Chaque event est passé au
 * reducer et appliqué au store canvas.
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
              // ignore les erreurs de parsing
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
