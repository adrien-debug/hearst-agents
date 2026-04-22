"use client";

/**
 * ChatContainer — Input global
 *
 * IDLE: Floating centered
 * FOCAL/RUNNING: Anchored bottom
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

    // Start run
    const runId = `run-${Date.now()}`;
    startRun(runId);

    // Send to API
    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          surface,
          thread_id: activeThreadId,
        }),
      });

      if (!res.ok) {
        addEvent({ type: "run_failed", error: "Server error", run_id: runId });
        return;
      }

      // Read stream
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
    ? `Que faire avec "${focal.title.slice(0, 30)}${focal.title.length > 30 ? "…" : ""}" ?`
    : "Que puis-je faire pour vous ?";

  // IDLE MODE
  if (isIdle) {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[10]">
        <div className="w-full max-w-[600px] px-6 pointer-events-auto">
          <div
            className={`
              flex items-end gap-3 rounded-xl border px-5 py-4 bg-surface
              transition-all duration-300
              ${isFocused
                ? "border-cyan-accent/50 shadow-[0_0_40px_rgba(0,229,255,0.15)]"
                : "border-white/10"
              }
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
              className="min-h-[28px] flex-1 resize-none bg-transparent text-lg text-white placeholder:text-white/30 focus:outline-none font-light"
              style={{ lineHeight: "1.4" }}
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className={`
                flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-150
                ${input.trim()
                  ? "bg-cyan-accent text-black hover:bg-cyan-300"
                  : "bg-white/5 text-white/30"
                }
              `}
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <p className="mt-4 text-center text-[11px] text-white/20">
            Entrée pour envoyer · Maj+Entrée pour nouvelle ligne
          </p>
        </div>
      </div>
    );
  }

  // FOCAL/RUNNING MODE
  return (
    <div className="absolute bottom-0 left-0 right-0 z-[40] border-t border-white/[0.06] bg-black/95 backdrop-blur-sm">
      <div className="mx-auto max-w-[720px] px-4 py-3">
        <div
          className={`
            flex items-end gap-3 rounded-lg border bg-surface px-3 py-2
            transition-all duration-150
            ${isFocused ? "border-cyan-accent/50" : "border-white/10"}
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
            className="min-h-[20px] flex-1 resize-none bg-transparent text-sm text-white/90 placeholder:text-white/30 focus:outline-none"
            style={{ lineHeight: "1.5" }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isRunning}
            className={`
              flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all duration-150
              ${input.trim() && !isRunning
                ? "bg-cyan-accent text-black hover:bg-cyan-300"
                : "bg-white/5 text-white/30 cursor-not-allowed"
              }
            `}
          >
            {isRunning ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-black/20 border-t-black" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
