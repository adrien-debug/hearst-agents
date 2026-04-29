"use client";

import { useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useNavigationStore } from "@/stores/navigation";
import { useStageStore } from "@/stores/stage";
import { useRuntimeStore } from "@/stores/runtime";
import { ChatInput } from "../ChatInput";
import { CockpitGreeting } from "./CockpitGreeting";
import { QuickActions } from "./QuickActions";
import type { Message } from "@/lib/core/types";

export function CockpitStage() {
  const router = useRouter();
  const addThread = useNavigationStore((s) => s.addThread);
  const addMessageToThread = useNavigationStore((s) => s.addMessageToThread);
  const updateThreadName = useNavigationStore((s) => s.updateThreadName);
  const setStageMode = useStageStore((s) => s.setMode);
  const addEvent = useRuntimeStore((s) => s.addEvent);
  const startRun = useRuntimeStore((s) => s.startRun);
  const setAbortController = useRuntimeStore((s) => s.setAbortController);

  const assistantBufferRef = useRef<string>("");
  const currentAssistantIdRef = useRef<string | null>(null);

  const handleSubmit = useCallback(
    async (message: string) => {
      const threadId = addThread("New", "home");
      const clientToken = `client-${Date.now()}`;
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: message,
      };
      addMessageToThread(threadId, userMessage);
      setStageMode({ mode: "chat", threadId });

      const raw = message.slice(0, 50);
      const name =
        message.length > 40
          ? raw.lastIndexOf(" ") > 15
            ? raw.slice(0, raw.lastIndexOf(" "))
            : raw.slice(0, 40)
          : message;
      updateThreadName(threadId, name);

      assistantBufferRef.current = "";
      currentAssistantIdRef.current = `assistant-${Date.now()}`;
      const assistantMessage: Message = {
        id: currentAssistantIdRef.current,
        role: "assistant",
        content: "",
      };
      addMessageToThread(threadId, assistantMessage);

      try {
        const response = await fetch("/api/v2/chat", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId,
            messages: [userMessage],
            clientToken,
          }),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No readable stream");

        startRun(threadId);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = new TextDecoder().decode(value);
          assistantBufferRef.current += text;
          addMessageToThread(threadId, {
            id: currentAssistantIdRef.current!,
            role: "assistant",
            content: assistantBufferRef.current,
          });
        }

        setAbortController(null); // Stream complete
      } catch (error) {
        console.error("Chat error:", error);
        addEvent({
          type: "error",
          message: error instanceof Error ? error.message : "Chat failed",
          timestamp: Date.now(),
        });
      }
    },
    [addThread, addMessageToThread, updateThreadName, setStageMode, addEvent, startRun],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden panel-enter">
      {/* Header: greeting + time */}
      <CockpitGreeting />

      {/* Quick actions grid */}
      <QuickActions />

      {/* Spacer */}
      <div className="flex-1 min-h-0" />

      {/* Chat input footer */}
      <div className="shrink-0 px-12 pb-12">
        <ChatInput onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
