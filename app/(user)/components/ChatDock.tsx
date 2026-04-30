"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useNavigationStore } from "@/stores/navigation";
import { useRuntimeStore } from "@/stores/runtime";
import { useStageStore, type StagePayload } from "@/stores/stage";
import { useServicesStore } from "@/stores/services";
import { getAllServices } from "@/lib/integrations/catalog";
import type { ServiceWithConnectionStatus } from "@/lib/integrations/types";
import { toast } from "@/app/hooks/use-toast";
import type { Message } from "@/lib/core/types";
import { ChatInput } from "./ChatInput";

function trackAnalytics(
  type: "first_message_sent" | "run_completed" | "run_failed",
  properties?: Record<string, unknown>,
) {
  fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, properties }),
  }).catch(() => {});
}

const baseServices: ServiceWithConnectionStatus[] = getAllServices().map((s) => ({
  ...s,
  connectionStatus: "disconnected" as const,
}));

export function ChatDock() {
  const router = useRouter();
  const pathname = usePathname();

  const surface = useNavigationStore((s) => s.surface);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const messagesRaw = useNavigationStore((s) =>
    activeThreadId ? s.messages[activeThreadId] : undefined,
  );
  const messages = useMemo(() => messagesRaw ?? [], [messagesRaw]);
  const addMessageToThread = useNavigationStore((s) => s.addMessageToThread);
  const addThread = useNavigationStore((s) => s.addThread);
  const updateMessageInThread = useNavigationStore((s) => s.updateMessageInThread);
  const updateThreadName = useNavigationStore((s) => s.updateThreadName);

  const addEvent = useRuntimeStore((s) => s.addEvent);
  const startRun = useRuntimeStore((s) => s.startRun);
  const setAbortController = useRuntimeStore((s) => s.setAbortController);

  const setStageMode = useStageStore((s) => s.setMode);
  const stageMode = useStageStore((s) => s.current.mode);

  const services = useServicesStore((s) => s.services);
  const setStoreServices = useServicesStore((s) => s.setServices);
  const setStoreLoaded = useServicesStore((s) => s.setLoaded);
  const connectedServices = useMemo(
    () => services.filter((s) => s.connectionStatus === "connected"),
    [services],
  );

  // Bootstrap services + handle ?connected= flow.
  useEffect(() => {
    if (services.length === 0) setStoreServices(baseServices);

    async function loadConnections() {
      try {
        const res = await fetch("/api/v2/user/connections", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.services && Array.isArray(data.services)) {
          setStoreServices(data.services as ServiceWithConnectionStatus[]);
        }
      } catch {
        /* non-fatal */
      } finally {
        setStoreLoaded(true);
      }
    }

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const justConnected = params.get("connected");
      if (justConnected) {
        void fetch("/api/composio/invalidate-cache", { method: "POST", credentials: "include" })
          .catch(() => {})
          .finally(() => {
            loadConnections();
            const url = new URL(window.location.href);
            url.searchParams.delete("connected");
            window.history.replaceState({}, "", url.toString());
            toast.success(`${justConnected} connecté`, "Vous pouvez relancer votre demande.");
          });
        return;
      }
    }

    loadConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const assistantBufferRef = useRef<string>("");
  const currentAssistantIdRef = useRef<string | null>(null);

  const handleSubmit = useCallback(
    async (
      message: string,
      opts?: { attachedAssetIds?: string[]; personaId?: string | null },
    ) => {
      // Si on n'est pas sur la page racine, on y revient pour que l'utilisateur
      // voie le Stage chat se mettre à jour avec ses messages.
      if (pathname !== "/") {
        router.push("/");
      }

      const threadId = activeThreadId ?? addThread("New", surface);
      const clientToken = `client-${Date.now()}`;
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: message,
      };
      addMessageToThread(threadId, userMessage);

      if (stageMode === "cockpit") {
        setStageMode({ mode: "chat", threadId });
      }

      if (messages.length === 0) {
        trackAnalytics("first_message_sent", { threadId });
        const raw = message.slice(0, 50);
        const name =
          message.length > 40
            ? raw.lastIndexOf(" ") > 15
              ? raw.slice(0, raw.lastIndexOf(" "))
              : raw.slice(0, 40)
            : message;
        updateThreadName(threadId, name);
      }

      assistantBufferRef.current = "";
      currentAssistantIdRef.current = `assistant-${Date.now()}`;
      const assistantMessage: Message = {
        id: currentAssistantIdRef.current,
        role: "assistant",
        content: "",
      };
      addMessageToThread(threadId, assistantMessage);

      const recentMessages = messages
        .filter(
          (m) => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0,
        )
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      startRun(clientToken);
      const controller = new AbortController();
      setAbortController(controller);

      try {
        const res = await fetch("/api/orchestrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            surface,
            thread_id: threadId,
            conversation_id: threadId,
            history: recentMessages,
            capability_mode: "general",
            ...(opts?.attachedAssetIds && opts.attachedAssetIds.length > 0
              ? { attached_asset_ids: opts.attachedAssetIds }
              : {}),
            ...(opts?.personaId
              ? { persona_id: opts.personaId }
              : {}),
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const errorMsg = `Erreur serveur: ${res.status}`;
          toast.error("Échec de l'envoi", errorMsg);
          addEvent({
            type: "run_failed",
            error: errorMsg,
            run_id: clientToken,
            client_token: clientToken,
          });
          return;
        }
        const reader = res.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let buffer = "";
        let canonicalRunId: string | null = null;

        while (true) {
          if (controller.signal.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "run_started" && event.run_id) {
                canonicalRunId = event.run_id as string;
              }
              if (event.type === "text_delta" && event.delta) {
                assistantBufferRef.current += event.delta;
                updateMessageInThread(
                  threadId,
                  currentAssistantIdRef.current!,
                  assistantBufferRef.current,
                );
              }
              if (event.type === "stage_request" && event.stage) {
                setStageMode(event.stage as StagePayload);
              }
              const eventRunId = (event.run_id as string) || canonicalRunId || clientToken;
              addEvent({ ...event, run_id: eventRunId });
            } catch (_parseErr) {}
          }
        }

        if (controller.signal.aborted) return;

        trackAnalytics("run_completed", {
          runId: canonicalRunId || clientToken,
          messageCount: messages.length,
        });
      } catch (err) {
        const isAbort =
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError") ||
          (err instanceof Error && err.name === "AbortError");
        if (isAbort) return;

        const errorMsg = err instanceof Error ? err.message : "Échec de la connexion";
        toast.error("Erreur de connexion", errorMsg);
        addEvent({ type: "run_failed", error: errorMsg, run_id: clientToken });
        trackAnalytics("run_failed", { runId: clientToken, error: errorMsg });
      } finally {
        setAbortController(null);
      }
    },
    [
      pathname,
      router,
      surface,
      activeThreadId,
      addThread,
      messages,
      addEvent,
      startRun,
      setAbortController,
      addMessageToThread,
      updateMessageInThread,
      updateThreadName,
      stageMode,
      setStageMode,
    ],
  );

  return (
    <ChatInput
      onSubmit={handleSubmit}
      connectedServices={connectedServices}
      threadId={activeThreadId ?? null}
    />
  );
}
