"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useFocalStore } from "@/stores/focal";
import { useRuntimeStore } from "@/stores/runtime";
import { useNavigationStore } from "@/stores/navigation";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default function HomePage() {
  const { data: session } = useSession();
  const focal = useFocalStore((s) => s.focal);
  const isRunning = useRuntimeStore((s) => s.coreState !== "idle");
  const coreState = useRuntimeStore((s) => s.coreState);
  const flowLabel = useRuntimeStore((s) => s.flowLabel);
  const addEvent = useRuntimeStore((s) => s.addEvent);
  const startRun = useRuntimeStore((s) => s.startRun);
  const surface = useNavigationStore((s) => s.surface);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);

  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const firstName = session?.user?.name?.split(" ")[0];
  const isIdle = !focal && !isRunning;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!input.trim() || isRunning) return;
    const message = input.trim();
    setInput("");

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
      if (!reader) return;

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
          } catch {}
        }
      }
    } catch (err) {
      addEvent({
        type: "run_failed",
        error: err instanceof Error ? err.message : "Failed",
        run_id: runId,
      });
    }
  };

  // IDLE view
  if (isIdle) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
          <h1 className="text-3xl font-light text-white/90 tracking-wide text-center">
            {greeting()}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-4 text-sm text-white/40 text-center">
            Parlez-moi de vos emails, fichiers, agenda...
          </p>
        </div>
        <div className="border-t border-white/[0.08] bg-black p-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-end gap-2 bg-[#14141a] border border-white/10 rounded-xl px-4 py-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSubmit())}
                placeholder="Que puis-je faire pour vous ?"
                rows={1}
                className="flex-1 bg-transparent text-white placeholder:text-white/30 focus:outline-none resize-none text-base min-h-[24px]"
                style={{ lineHeight: "1.5" }}
              />
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isRunning}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-white/40 hover:bg-[#00e5ff] hover:text-black disabled:opacity-30 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-white/20 text-center mt-2">
              Entrée pour envoyer · Maj+Entrée pour nouvelle ligne
            </p>
          </div>
        </div>
      </div>
    );
  }

  // RUNNING view
  if (!focal && isRunning) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse" />
            <span className="text-white/60">{flowLabel || "En cours..."}</span>
          </div>
          <span className="text-xs text-white/30 font-mono uppercase mt-3">{coreState}</span>
        </div>
        <div className="border-t border-white/[0.08] bg-black p-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-end gap-2 bg-[#14141a] border border-white/10 rounded-xl px-4 py-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSubmit())}
                placeholder="Que puis-je faire pour vous ?"
                rows={1}
                className="flex-1 bg-transparent text-white placeholder:text-white/30 focus:outline-none resize-none text-sm min-h-[20px]"
                style={{ lineHeight: "1.5" }}
              />
              <div className="w-8 h-8 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // FOCAL view
  if (focal) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-auto px-6 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00e5ff]" />
              <span className="text-xs font-mono uppercase tracking-wider text-white/40">{focal.type}</span>
            </div>
            <h2 className="text-xl font-normal text-white/90 mb-6">{focal.title}</h2>
            {focal.body && (
              <div className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{focal.body}</div>
            )}
            {!focal.body && focal.summary && (
              <p className="text-sm text-white/70 leading-relaxed">{focal.summary}</p>
            )}
            {focal.sections?.map((s, i) => (
              <div key={i} className="mt-6">
                {s.heading && <h3 className="text-xs font-mono uppercase tracking-wider text-white/40 mb-2">{s.heading}</h3>}
                <p className="text-sm text-white/70 leading-relaxed">{s.body}</p>
              </div>
            ))}
            {focal.wordCount && <p className="text-xs text-white/30 font-mono mt-6">{focal.wordCount} mots</p>}
          </div>
        </div>
        <div className="border-t border-white/[0.08] bg-black p-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-end gap-2 bg-[#14141a] border border-white/10 rounded-xl px-4 py-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSubmit())}
                placeholder={`Suite de "${focal.title.slice(0, 20)}..."`}
                rows={1}
                className="flex-1 bg-transparent text-white placeholder:text-white/30 focus:outline-none resize-none text-sm min-h-[20px]"
                style={{ lineHeight: "1.5" }}
              />
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isRunning}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-white/40 hover:bg-[#00e5ff] hover:text-black disabled:opacity-30 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
