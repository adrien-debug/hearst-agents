"use client";

import { useRef, useCallback, useMemo, useEffect } from "react";
import { useFocalStore } from "@/stores/focal";
import { useRuntimeStore } from "@/stores/runtime";
import { useNavigationStore } from "@/stores/navigation";
import { useServicesStore } from "@/stores/services";
import { useStageStore, type StagePayload } from "@/stores/stage";
import type { Message, RightPanelData } from "@/lib/core/types";
import { mapFocalObject, mapFocalObjects } from "@/lib/core/types/focal";
import { Stage } from "./components/Stage";
import { toast } from "@/app/hooks/use-toast";

function trackAnalytics(type: "first_message_sent" | "run_completed" | "run_failed", properties?: Record<string, unknown>) {
  // Anti-pattern banni : pas d'userId envoyé au backend depuis le frontend.
  // /api/analytics résout l'utilisateur via requireScope() côté serveur.
  fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, properties }),
  }).catch(() => {});
}

/**
 * HomePage — Pivot 2026-04-29 : devient un router de Stages polymorphes.
 *
 * Avant le pivot : home = chat-first (greeting + suggestions OU chat).
 * Après : home = `<Stage />` qui rend cockpit / chat / asset / browser /
 * meeting / kg / voice selon le mode actif dans `useStageStore`.
 *
 * La logique de soumission (handleSubmit), de chargement des services
 * et de hydration RightPanel reste ici car elle est partagée entre tous
 * les Stages. Les ChatMessages et la FocalStage embedded sont rendus
 * par ChatStage spécifiquement.
 */
export default function HomePage() {
  const hydrateThreadState = useFocalStore((s) => s.hydrateThreadState);
  const addEvent = useRuntimeStore((s) => s.addEvent);
  const startRun = useRuntimeStore((s) => s.startRun);
  const setAbortController = useRuntimeStore((s) => s.setAbortController);
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
  const setStageMode = useStageStore((s) => s.setMode);
  const stageMode = useStageStore((s) => s.current.mode);

  useEffect(() => {
    if (!activeThreadId) {
      hydrateThreadState(null, []);
      return;
    }

    const fetchThreadState = async () => {
      try {
        const res = await fetch(`/api/v2/right-panel?thread_id=${encodeURIComponent(activeThreadId)}`);
        if (!res.ok) {
          hydrateThreadState(null, []);
          return;
        }

        const data: RightPanelData = await res.json();

        const secondary =
          data.secondaryObjects && Array.isArray(data.secondaryObjects)
            ? mapFocalObjects(data.secondaryObjects as unknown[], activeThreadId).slice(0, 3)
            : [];

        const mappedFocal = data.focalObject
          ? mapFocalObject(data.focalObject, activeThreadId)
          : null;
        hydrateThreadState(mappedFocal, secondary);
      } catch (_err) {
        hydrateThreadState(null, []);
      }
    };

    fetchThreadState();
  }, [activeThreadId, hydrateThreadState]);

  const hideFocalStage = useFocalStore((s) => s.hide);
  const setStoreServices = useServicesStore((s) => s.setServices);
  const setStoreLoaded = useServicesStore((s) => s.setLoaded);

  const setServices = useCallback((next: ServiceWithConnectionStatus[]) => {
    setStoreServices(next);
  }, [setStoreServices]);
  const setConnectionsLoaded = useCallback((next: boolean) => {
    setStoreLoaded(next);
  }, [setStoreLoaded]);

  useEffect(() => {
    async function loadConnections() {
      try {
        const res = await fetch("/api/v2/user/connections", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.services && Array.isArray(data.services)) {
          setServices(data.services as ServiceWithConnectionStatus[]);
        }
      } catch (_err) {
        // Non-fatal — services stay at default disconnected state.
      } finally {
        setConnectionsLoaded(true);
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
  }, [setServices, setConnectionsLoaded]);

  const assistantBufferRef = useRef<string>("");
  const currentAssistantIdRef = useRef<string | null>(null);

  const handleSubmit = useCallback(async (message: string) => {
    const threadId = activeThreadId ?? addThread("New", surface);
    const clientToken = `client-${Date.now()}`;
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
    };
    addMessageToThread(threadId, userMessage);

    // Premier message d'un thread → switch automatique vers le Stage chat.
    // Les Stages spécialisés (asset/browser/meeting/kg/voice) sont déclenchés
    // par les tools côté backend qui SSE-broadcast un "stage_request" event.
    if (stageMode === "cockpit") {
      setStageMode({ mode: "chat", threadId });
    }

    if (messages.length === 0) {
      trackAnalytics("first_message_sent", { threadId });
      const raw = message.slice(0, 50);
      const name = message.length > 40
        ? (raw.lastIndexOf(" ") > 15 ? raw.slice(0, raw.lastIndexOf(" ")) : raw.slice(0, 40))
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
      .filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0)
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
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errorMsg = `Erreur serveur: ${res.status}`;
        toast.error("Échec de l'envoi", errorMsg);
        addEvent({ type: "run_failed", error: errorMsg, run_id: clientToken, client_token: clientToken });
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
              updateMessageInThread(threadId, currentAssistantIdRef.current!, assistantBufferRef.current);
            }
            // Stage routing — un tool a demandé à téléporter l'utilisateur.
            // Le payload `stage` matche la shape StagePayload du store.
            if (event.type === "stage_request" && event.stage) {
              setStageMode(event.stage as StagePayload);
            }
            const eventRunId = (event.run_id as string) || canonicalRunId || clientToken;
            addEvent({ ...event, run_id: eventRunId });
          } catch (_parseErr) {}
        }
      }

      if (controller.signal.aborted) {
        return;
      }

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
  }, [surface, activeThreadId, addThread, messages, addEvent, startRun, setAbortController, addMessageToThread, updateMessageInThread, updateThreadName, stageMode, setStageMode]);

  // Esc ferme le focal stage. Ignore les inputs/textarea/contenteditable.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (!useFocalStore.getState().isVisible) return;
      e.preventDefault();
      hideFocalStage();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hideFocalStage]);

  return (
    <Stage
      messages={messages}
      hasMessages={messages.length > 0}
      onSubmit={handleSubmit}
    />
  );
}
