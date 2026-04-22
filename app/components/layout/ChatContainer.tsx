"use client";

/**
 * ChatContainer — Input system
 *
 * Coherent spacing, consistent with RightPanel
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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!input.trim() || isRunning) return;

    const message = input.trim();
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";

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
            // skip
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
    ? `Suite de "${focal.title.slice(0, 24)}..."`
    : "Parlez-moi de vos emails, fichiers, agenda...";

  return (
    <div className="border-t border-white/[0.08] bg-black">
      <div className={`mx-auto px-4 py-4 ${isIdle ? "max-w-[640px]" : "max-w-[720px]"}`}>
        <div className={`input-container ${isFocused ? "ring-1 ring-cyan-500/20" : ""}`}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            rows={1}
            className="input-field"
            style={{ lineHeight: "1.5" }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isRunning}
            className={`btn-icon ${input.trim() && !isRunning ? "btn-primary" : ""}`}
          >
            {isRunning ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" className="opacity-20" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>

        {isIdle && (
          <p className="text-center text-caption mt-3">
            Entrée pour envoyer · Maj+Entrée pour nouvelle ligne
          </p>
        )}
      </div>
    </div>
  );
}
