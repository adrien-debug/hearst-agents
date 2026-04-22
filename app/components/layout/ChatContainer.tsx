"use client";

/**
 * ChatContainer — Input toujours en bas
 *
 * IDLE: Input centré dans la zone
 * FOCAL/RUNNING: Input collé en bas
 */

import { useState, useRef, useEffect } from "react";
import { useFocalStore } from "@/stores/focal";
import { useRuntimeStore } from "@/stores/runtime";
import { useNavigationStore } from "@/stores/navigation";

export default function ChatContainer() {
  const [input, setInput] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const focal = useFocalStore((s) => s.focal);
  const isRunning = useRuntimeStore((s) => s.coreState !== "idle");
  const addEvent = useRuntimeStore((s) => s.addEvent);
  const startRun = useRuntimeStore((s) => s.startRun);
  const surface = useNavigationStore((s) => s.surface);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);

  const isIdle = !focal && !isRunning;

  // Auto-focus
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!input.trim() || isRunning) return;

    const message = input.trim();
    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    const runId = `run-${Date.now()}`;
    startRun(runId);

    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, surface, thread_id: activeThreadId }),
      });

      if (!res.ok) {
        addEvent({ type: "run_failed", error: "Server error", run_id: runId });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        addEvent({ type: "run_failed", error: "No stream", run_id: runId });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

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
            addEvent({ ...event, run_id: runId });
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err) {
      addEvent({
        type: "run_failed",
        error: err instanceof Error ? err.message : "Connection failed",
        run_id: runId,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const placeholder = focal
    ? `Que faire avec "${focal.title.slice(0, 30)}..." ?`
    : "Que puis-je faire pour vous ?";

  return (
    <div className={`border-t border-white/[0.06] bg-black ${isIdle ? "" : "bg-black/95 backdrop-blur-sm"}`}>
      <div className={`mx-auto px-4 py-4 ${isIdle ? "max-w-[600px]" : "max-w-[720px]"}`}>
        <div
          className={`
            flex items-end gap-3 rounded-xl border bg-surface px-4 py-3
            transition-all duration-200
            ${isFocused ? "border-cyan-accent/50 shadow-[0_0_30px_rgba(0,229,255,0.1)]" : "border-white/10"}
          `}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            rows={1}
            className={`
              flex-1 resize-none bg-transparent placeholder:text-white/30 focus:outline-none
              ${isIdle ? "text-lg font-light" : "text-sm"}
            `}
            style={{ lineHeight: "1.4", minHeight: "24px" }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isRunning}
            className={`
              flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all
              ${input.trim() && !isRunning
                ? "bg-cyan-accent text-black hover:bg-cyan-300"
                : "bg-white/5 text-white/30 cursor-not-allowed"
              }
            `}
          >
            {isRunning ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
        {isIdle && (
          <p className="mt-3 text-center text-[11px] text-white/20">
            Entrée pour envoyer · Maj+Entrée pour nouvelle ligne
          </p>
        )}
      </div>
    </div>
  );
}
