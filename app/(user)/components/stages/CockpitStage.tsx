"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useNavigationStore } from "@/stores/navigation";
import { useStageStore } from "@/stores/stage";
import { useRuntimeStore } from "@/stores/runtime";
import { ChatInput } from "../ChatInput";
import { CockpitHero } from "./CockpitHero";
import type { Message } from "@/lib/core/types";

export function CockpitStage() {
  const router = useRouter();
  const addThread          = useNavigationStore((s) => s.addThread);
  const addMessageToThread = useNavigationStore((s) => s.addMessageToThread);
  const updateThreadName   = useNavigationStore((s) => s.updateThreadName);
  const setStageMode       = useStageStore((s) => s.setMode);
  const addEvent           = useRuntimeStore((s) => s.addEvent);
  const startRun           = useRuntimeStore((s) => s.startRun);
  const setAbortController = useRuntimeStore((s) => s.setAbortController);

  const bufferRef = useRef<string>("");
  const asstIdRef = useRef<string | null>(null);

  const focusInput = () => {
    const ta = document.querySelector<HTMLTextAreaElement>(".cockpit-input-pill textarea");
    ta?.focus();
  };

  const newBrief = () => {
    const threadId = addThread("New", "home");
    setStageMode({ mode: "chat", threadId });
  };

  const handleSubmit = useCallback(async (message: string) => {
    const threadId    = addThread("New", "home");
    const clientToken = `client-${Date.now()}`;
    const userMsg: Message = { id: `user-${Date.now()}`, role: "user", content: message };

    addMessageToThread(threadId, userMsg);
    setStageMode({ mode: "chat", threadId });

    const raw = message.slice(0, 50);
    updateThreadName(
      threadId,
      message.length > 40
        ? raw.slice(0, raw.lastIndexOf(" ") > 15 ? raw.lastIndexOf(" ") : 40)
        : message,
    );

    bufferRef.current = "";
    asstIdRef.current = `assistant-${Date.now()}`;
    addMessageToThread(threadId, { id: asstIdRef.current, role: "assistant", content: "" });

    try {
      const res = await fetch("/api/v2/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, messages: [userMsg], clientToken }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      startRun(threadId);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bufferRef.current += new TextDecoder().decode(value);
        addMessageToThread(threadId, { id: asstIdRef.current!, role: "assistant", content: bufferRef.current });
      }
      setAbortController(null);
    } catch (err) {
      addEvent({ type: "error", message: err instanceof Error ? err.message : "Chat failed", timestamp: Date.now() });
    }
  }, [addThread, addMessageToThread, updateThreadName, setStageMode, addEvent, startRun, setAbortController]);

  const QUICK_ACTIONS = [
    { label: "New brief",   hotkey: "⌘B", action: newBrief },
    { label: "Run query",   hotkey: "⌘Q", action: focusInput },
    { label: "View assets", hotkey: "⌘A", action: () => router.push("/assets") },
  ];

  return (
    <div className="cockpit-bg flex-1 flex flex-col min-h-0 relative overflow-hidden panel-enter">

      {/* Hero — shared component */}
      <CockpitHero />

      {/* Quick actions — bare command lines, grid var(--space-12) */}
      <div style={{ padding: "0 var(--space-12) var(--space-12)" }}>
        <p
          className="font-mono uppercase"
          style={{
            fontSize: "10px",
            fontWeight: 500,
            letterSpacing: "var(--tracking-label)",
            color: "var(--text-l3)",
            marginBottom: "var(--space-6)",
          }}
        >
          Quick actions
        </p>
        {QUICK_ACTIONS.map((a) => (
          <button key={a.label} type="button" onClick={a.action} className="cockpit-action">
            <span className="ca-label">{a.label}</span>
            <span className="ca-hotkey">{a.hotkey}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0" />

      {/* Input — primary focal point */}
      <div className="cockpit-input-wrap" style={{ padding: "0 var(--space-12) var(--space-12)" }}>
        <ChatInput onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
