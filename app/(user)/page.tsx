"use client";

import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useFocalStore } from "@/stores/focal";
import { useRuntimeStore } from "@/stores/runtime";
import { useNavigationStore } from "@/stores/navigation";
import { useServicesStore } from "@/stores/services";
import type { Message, RightPanelData } from "@/lib/core/types";
import { mapFocalObject, mapFocalObjects } from "@/lib/core/types/focal";
import { FocalStage } from "./components/FocalStage";
import { ChatInput } from "./components/ChatInput";
import { ChatMessages } from "./components/ChatMessages";
import { Breadcrumb, type Crumb } from "./components/Breadcrumb";
import { AgentActivityStrip } from "./components/AgentActivityStrip";
import { getAllServices } from "@/lib/integrations/catalog";
import type { ServiceWithConnectionStatus } from "@/lib/integrations/types";
import { toast } from "@/app/hooks/use-toast";

function trackAnalytics(type: "first_message_sent" | "run_completed" | "run_failed", userId: string, properties?: Record<string, unknown>) {
  fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, userId, properties }),
  }).catch(() => {});
}

const initialServices = (() => {
  const baseServices = getAllServices();
  return baseServices.map((s) => ({
    ...s,
    connectionStatus: "disconnected" as const,
  }));
})();

const SUGGESTION_TEMPLATES: Array<{
  serviceId: string;
  title: string;
  subtitle: string;
}> = [
  { serviceId: "gmail",     title: "Résumer mes emails non lus",         subtitle: "Synthèse 24h · Gmail" },
  { serviceId: "calendar",  title: "Mon agenda d'aujourd'hui",            subtitle: "Événements & créneaux · Calendar" },
  { serviceId: "drive",     title: "Mes derniers documents",              subtitle: "Fichiers récents · Drive" },
  { serviceId: "slack",     title: "Mes messages Slack non lus",          subtitle: "Synthèse channels · Slack" },
  { serviceId: "notion",    title: "Mes pages récentes",                  subtitle: "Workspace · Notion" },
  { serviceId: "github",    title: "Mes PRs à reviewer",                  subtitle: "Code review · GitHub" },
  { serviceId: "linear",    title: "Mes issues assignées",                subtitle: "Backlog · Linear" },
  { serviceId: "jira",      title: "Mes tickets en cours",                subtitle: "Sprint · Jira" },
  { serviceId: "hubspot",   title: "Mes leads à relancer",                subtitle: "Pipeline · HubSpot" },
  { serviceId: "stripe",    title: "Mon revenu de la semaine",            subtitle: "Métriques · Stripe" },
];

const FALLBACK_SUGGESTIONS = [
  { serviceId: "_",  title: "Connecter mes outils",          subtitle: "Gmail, Slack, Notion, GitHub…" },
  { serviceId: "_",  title: "Que peux-tu faire ?",            subtitle: "Tour des capacités" },
  { serviceId: "_",  title: "Planifier une automation",       subtitle: "Brief récurrent" },
  { serviceId: "_",  title: "Faire une recherche web",        subtitle: "Veille · web" },
];

interface BuiltSuggestion {
  id: string;
  title: string;
  subtitle: string;
  /** Logo URL pulled from the matched service (when available). */
  iconPath?: string;
}

function buildSuggestions(connectedServices: ServiceWithConnectionStatus[]): BuiltSuggestion[] {
  const byId = new Map(connectedServices.map((s) => [s.id, s]));
  const matched = SUGGESTION_TEMPLATES
    .filter((t) => byId.has(t.serviceId))
    .slice(0, 4)
    .map((t) => ({ ...t, iconPath: byId.get(t.serviceId)?.icon }));
  const list = matched.length > 0 ? matched : FALLBACK_SUGGESTIONS;
  return list.map((s, i) => ({
    id: String(i + 1).padStart(2, "0"),
    title: s.title,
    subtitle: s.subtitle,
    iconPath: "iconPath" in s ? (s.iconPath as string | undefined) : undefined,
  }));
}

export default function HomePage() {
  const { data: session } = useSession();
  const focal = useFocalStore((s) => s.focal);
  const hydrateThreadState = useFocalStore((s) => s.hydrateThreadState);
  const coreState = useRuntimeStore((s) => s.coreState);
  const addEvent = useRuntimeStore((s) => s.addEvent);
  const startRun = useRuntimeStore((s) => s.startRun);
  const surface = useNavigationStore((s) => s.surface);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const activeThread = useNavigationStore((s) =>
    activeThreadId ? s.threads.find((t) => t.id === activeThreadId) : undefined
  );
  const messagesRaw = useNavigationStore((s) =>
    activeThreadId ? s.messages[activeThreadId] : undefined
  );
  const messages = useMemo(() => messagesRaw ?? [], [messagesRaw]);
  const addMessageToThread = useNavigationStore((s) => s.addMessageToThread);
  const addThread = useNavigationStore((s) => s.addThread);
  const updateMessageInThread = useNavigationStore((s) => s.updateMessageInThread);
  const updateThreadName = useNavigationStore((s) => s.updateThreadName);
  const firstName = session?.user?.name?.split(" ")[0];

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
            ? mapFocalObjects(
                data.secondaryObjects as unknown[],
                activeThreadId
              ).slice(0, 3)
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

  const [services, setServicesLocal] = useState<ServiceWithConnectionStatus[]>(initialServices);
  const [connectionsLoaded, setConnectionsLoadedLocal] = useState(false);
  const [showFocal, setShowFocal] = useState(false);
  const setStoreServices = useServicesStore((s) => s.setServices);
  const setStoreLoaded = useServicesStore((s) => s.setLoaded);

  const setServices = useCallback((next: ServiceWithConnectionStatus[]) => {
    setServicesLocal(next);
    setStoreServices(next);
  }, [setStoreServices]);
  const setConnectionsLoaded = useCallback((next: boolean) => {
    setConnectionsLoadedLocal(next);
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

    // OAuth return: invalidate Composio cache, refresh connections, strip query param.
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const justConnected = params.get("connected");
      if (justConnected) {
        void fetch("/api/composio/invalidate-cache", {
          method: "POST",
          credentials: "include",
        })
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

  const connectedServices = useMemo(
    () => services.filter((s) => s.connectionStatus === "connected"),
    [services]
  );

  const userEmail = session?.user?.email || "anonymous";

  const handleSubmit = useCallback(async (message: string) => {
    // If the user deleted every thread, recover by creating a fresh one
    // instead of silently swallowing the message.
    const threadId = activeThreadId ?? addThread("New", surface);
    const clientToken = `client-${Date.now()}`;
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
    };
    addMessageToThread(threadId, userMessage);

    if (messages.length === 0) {
      trackAnalytics("first_message_sent", userEmail, { threadId });
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
                assistantBufferRef.current
              );
            }
            const eventRunId = (event.run_id as string) || canonicalRunId || clientToken;
            addEvent({ ...event, run_id: eventRunId });
          } catch (_parseErr) {}
        }
      }

      trackAnalytics("run_completed", userEmail, {
        runId: canonicalRunId || clientToken,
        messageCount: messages.length,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Échec de la connexion";
      toast.error("Erreur de connexion", errorMsg);
      addEvent({ type: "run_failed", error: errorMsg, run_id: clientToken });
      trackAnalytics("run_failed", userEmail, {
        runId: clientToken,
        error: errorMsg,
      });
    }
  }, [surface, activeThreadId, addThread, messages, addEvent, startRun, addMessageToThread, updateMessageInThread, updateThreadName, userEmail]);

  const isIdle = coreState === "idle" && messages.length === 0 && !focal;

  const focalIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (focal && focal.id !== focalIdRef.current) {
      focalIdRef.current = focal.id;
      setShowFocal(true);
    }
  }, [focal]);

  // Re-show focal whenever the user explicitly clicks an asset/mission card
  // in the right panel — even if the focal id hasn't changed (otherwise a
  // closed focal stays closed when re-clicking the same item in the list).
  const viewRequestedAt = useFocalStore((s) => s.viewRequestedAt);
  useEffect(() => {
    if (viewRequestedAt > 0) setShowFocal(true);
  }, [viewRequestedAt]);

  if (isIdle) {
    const hour = new Date().getHours();
    const greeting =
      hour < 6 ? "Bonne nuit"
      : hour < 12 ? "Bonjour"
      : hour < 18 ? "Bon après-midi"
      : "Bonsoir";

    return (
      <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden panel-enter">

        <div className="flex-1 flex flex-col items-center justify-center px-10 pb-16 relative z-10">
          <div
            className="w-full flex flex-col items-center"
            style={{ maxWidth: "var(--width-center-max)", rowGap: "32px" }}
          >
            <div className="flex flex-col items-center gap-6 relative">
              {/* Cible cykan : ring 24px + dot 4px au centre. Visible sur dark
                  ET light, signature minimale, pas de glow qui s'efface sur fond clair. */}
              <div
                className="relative flex items-center justify-center"
                style={{ width: 24, height: 24 }}
                aria-hidden
              >
                <span className="absolute inset-0 rounded-full border border-[var(--cykan)]/40" />
                <span
                  className="w-1 h-1 rounded-full bg-[var(--cykan)] animate-pulse"
                  style={{ animationDuration: "2.4s" }}
                />
              </div>

              <div className="text-center space-y-2">
                <p
                  className="t-26 font-medium tracking-tight text-[var(--text)]"
                  style={{ lineHeight: "32px" }}
                >
                  {greeting}{firstName ? <span className="text-[var(--cykan)]">, {firstName}</span> : ""}
                </p>
                <p className="t-13 text-[var(--text-subtitle)]" style={{ lineHeight: "20px" }}>
                  Que puis-je faire pour vous&nbsp;?
                </p>
              </div>
            </div>

          </div>
        </div>

        <ChatInput
          onSubmit={handleSubmit}
          connectedServices={connectedServices}
        />
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative"
      style={{ background: "var(--bg-center)" }}
    >
      {/* Strip activité agents — header live, visible quand un run tourne */}
      <AgentActivityStrip />

      {focal && showFocal && (() => {
        const threadLabel = activeThread?.name?.trim() ?? "";
        const titleLabel = focal.title?.trim() ?? "";
        const looksLikeDuplicate =
          !!threadLabel &&
          !!titleLabel &&
          (titleLabel.toLowerCase().includes(threadLabel.toLowerCase()) ||
            threadLabel.toLowerCase().includes(titleLabel.toLowerCase().slice(0, 32)));
        const trail: Crumb[] = looksLikeDuplicate
          ? [
              { label: focal.type.toUpperCase() },
              { label: focal.title, accent: true },
            ]
          : [
              { label: threadLabel || "Hearst" },
              { label: focal.type.toUpperCase() },
              { label: focal.title, accent: true },
            ];
        return (
        <div className="flex-1 flex flex-col min-h-0 border-b border-[var(--surface-2)] bg-gradient-to-b from-[var(--surface-1)] to-transparent">
          {/* Focal header — breadcrumb + close */}
          <div className="flex items-center justify-between px-12 py-6 flex-shrink-0 relative z-10 border-b border-[var(--surface-2)]">
            <Breadcrumb trail={trail} className="min-w-0 truncate" />
            <button
              onClick={() => setShowFocal(false)}
              className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] hover:text-[var(--text)] transition-colors shrink-0"
              title="Minimiser (rester dans le contexte)"
            >
              Close [x]
            </button>
          </div>
          {/* Focal content - principal reading surface */}
          <div className="flex-1 overflow-y-auto">
            <FocalStage />
          </div>
        </div>
        );
      })()}

      {/* Collapsed focal indicator - contextual chip */}
      {focal && !showFocal && (
        <div className="flex-shrink-0 px-12 py-8 relative z-10">
          <button
            onClick={() => setShowFocal(true)}
            className="inline-flex items-center gap-6 group"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--cykan)] animate-pulse halo-dot" />
            <div className="flex flex-col items-start">
              <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] group-hover:text-[var(--cykan)] group-hover:halo-cyan-sm transition-colors">
                {focal.type === "brief" ? "Active Brief" : focal.type === "report" ? "Active Report" : "Active Document"}
              </span>
              <span className="t-15 font-medium tracking-tight text-[var(--text-muted)] group-hover:translate-x-1 group-hover:text-[var(--text)] transition-all duration-300">{focal.title}</span>
            </div>
          </button>
        </div>
      )}

      {messages.length > 0 && (
        <div className={focal && showFocal ? "flex-shrink-0 h-[320px] border-t border-[var(--surface-2)] bg-gradient-to-b from-[var(--surface-1)] to-transparent" : "flex-1 min-h-0 bg-gradient-to-b from-[var(--mat-050)] to-[var(--bg-soft)]"}>
          <ChatMessages
            messages={messages}
            compact={!!(focal && showFocal)}
            className={focal && showFocal ? "h-full overflow-y-auto px-10 py-6 flex flex-col" : "h-full overflow-y-auto px-12 py-10 flex flex-col"}
            onQuickReply={handleSubmit}
          />
        </div>
      )}
      <ChatInput
        onSubmit={handleSubmit}
        placeholder={focal ? "Continuer sur ce document…" : undefined}
        connectedServices={connectedServices}
      />
    </div>
  );
}
