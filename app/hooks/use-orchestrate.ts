"use client";

import { useState, useRef, useCallback } from "react";
import { useRunStreamOptional } from "@/app/lib/run-stream-context";

export interface V2Event {
  type: string;
  [key: string]: unknown;
}

export type V2Status = "idle" | "running" | "completed" | "failed";

export function useOrchestrate() {
  const [events, setEvents] = useState<V2Event[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<V2Status>("idle");
  const abortRef = useRef<AbortController | null>(null);
  const runStream = useRunStreamOptional();

  const send = useCallback(async (message: string, surface?: string, conversationId?: string, focalContext?: { id: string; objectType: string; title: string; status: string }, threadId?: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setEvents([]);
    setText("");
    setStatus("running");
    runStream?.setConnected(true);

    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, surface, conversation_id: conversationId, focal_context: focalContext, thread_id: threadId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        setStatus("failed");
        setText("Erreur serveur.");
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setStatus("failed");
        setText("Pas de stream.");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as V2Event;
            setEvents((prev) => [...prev, event]);
            runStream?.push({ ...event, timestamp: Date.now() });

            if (event.type === "text_delta" && typeof event.delta === "string") {
              accumulated += event.delta;
              setText(accumulated);
            }
            if (event.type === "run_completed") {
              setStatus("completed");
            }
            if (event.type === "run_failed") {
              setStatus("failed");
              if (typeof event.error === "string") {
                setText(event.error);
              }
            }
          } catch {
            /* skip malformed SSE lines */
          }
        }
      }

      setStatus((s) => (s === "running" ? "completed" : s));
      runStream?.setConnected(false);
    } catch (err) {
      runStream?.setConnected(false);
      if ((err as Error).name === "AbortError") return;
      setStatus("failed");
      setText("Connexion impossible.");
    }
  }, [runStream]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
  }, []);

  return { send, abort, events, text, status };
}
