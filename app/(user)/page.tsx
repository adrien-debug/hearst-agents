"use client";

import { useRef, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useFocalStore } from "@/stores/focal";
import { useRuntimeStore } from "@/stores/runtime";
import { useNavigationStore, type Message } from "@/stores/navigation";
import { FocalStage } from "./components/FocalStage";
import { ChatInput } from "./components/ChatInput";
import { ChatMessages } from "./components/ChatMessages";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default function HomePage() {
  const { data: session } = useSession();
  const focal = useFocalStore((s) => s.focal);
  const coreState = useRuntimeStore((s) => s.coreState);
  const flowLabel = useRuntimeStore((s) => s.flowLabel);
  const addEvent = useRuntimeStore((s) => s.addEvent);
  const startRun = useRuntimeStore((s) => s.startRun);
  const surface = useNavigationStore((s) => s.surface);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const messagesRaw = useNavigationStore((s) => 
    activeThreadId ? s.messages[activeThreadId] : undefined
  );
  const messages = useMemo(() => messagesRaw ?? [], [messagesRaw]);
  const addMessageToThread = useNavigationStore((s) => s.addMessageToThread);
  const updateMessageInThread = useNavigationStore((s) => s.updateMessageInThread);
  const firstName = session?.user?.name?.split(" ")[0];

  const assistantBufferRef = useRef<string>("");
  const currentAssistantIdRef = useRef<string | null>(null);

  const handleSubmit = useCallback(async (message: string) => {
    if (!activeThreadId) return;
    
    const runId = `run-${Date.now()}`;
    
    // Add user message to current thread
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
    };
    addMessageToThread(activeThreadId, userMessage);
    
    // Reset assistant buffer for new run
    assistantBufferRef.current = "";
    currentAssistantIdRef.current = `assistant-${Date.now()}`;
    
    // Add initial empty assistant message
    const assistantMessage: Message = {
      id: currentAssistantIdRef.current,
      role: "assistant",
      content: "",
    };
    addMessageToThread(activeThreadId, assistantMessage);
    
    startRun(runId);
    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, surface, thread_id: activeThreadId }),
      });
      if (!res.ok) { addEvent({ type: "run_failed", error: "Server error", run_id: runId }); return; }
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
            
            // Handle text_delta events for streaming assistant responses
            if (event.type === "text_delta" && event.delta) {
              assistantBufferRef.current += event.delta;
              updateMessageInThread(
                activeThreadId,
                currentAssistantIdRef.current!,
                assistantBufferRef.current
              );
            }
            
            addEvent({ ...event, run_id: runId });
          } catch {}
        }
      }
    } catch (err) {
      addEvent({ type: "run_failed", error: err instanceof Error ? err.message : "Failed", run_id: runId });
    }
  }, [surface, activeThreadId, addEvent, startRun, addMessageToThread, updateMessageInThread]);

  const isIdle = !focal && coreState === "idle" && messages.length === 0;
  const isRunning = !focal && coreState !== "idle";
  const hasConversation = messages.length > 0 && !focal;

  if (isIdle) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="text-center space-y-4">
            <h1 className="text-3xl font-light text-white/90 tracking-wide">{greeting()}{firstName ? `, ${firstName}` : ""}</h1>
            <p className="text-sm text-white/40 max-w-md">Comment puis-je vous aider aujourd&apos;hui ?</p>
            <div className="flex flex-wrap justify-center gap-2 mt-8">
              {["Résumer mes emails", "Planifier une réunion", "Analyser un document", "Créer un rapport"].map((s) => (
                <button key={s} onClick={() => handleSubmit(s)} className="px-3 py-1.5 text-xs bg-white/[0.03] hover:bg-white/[0.06] text-white/60 hover:text-white/80 rounded-full border border-white/[0.06] transition-colors">{s}</button>
              ))}
            </div>
          </div>
        </div>
        <ChatInput onSubmit={handleSubmit} />
      </div>
    );
  }

  if (isRunning || hasConversation) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <ChatMessages messages={messages} />
        <ChatInput onSubmit={handleSubmit} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <FocalStage />
      <ChatInput onSubmit={handleSubmit} placeholder={`Continuer sur "${focal?.title.slice(0, 30)}..."`} />
    </div>
  );
}
