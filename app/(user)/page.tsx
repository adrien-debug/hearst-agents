"use client";

import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useFocalStore } from "@/stores/focal";
import { useRuntimeStore } from "@/stores/runtime";
import { useNavigationStore } from "@/stores/navigation";
import type { Message, RightPanelData } from "@/lib/core/types";
import { mapFocalObject, mapFocalObjects } from "@/lib/core/types/focal";
import { FocalStage } from "./components/FocalStage";
import { ChatInput } from "./components/ChatInput";
import { ChatMessages } from "./components/ChatMessages";
import { Breadcrumb, type Crumb } from "./components/Breadcrumb";
import { getAllServices } from "@/lib/integrations/catalog";
import type { ServiceWithConnectionStatus } from "@/lib/integrations/types";
import { toast } from "@/app/hooks/use-toast";

// Analytics tracking helper (client-side)
function trackAnalytics(type: "first_message_sent" | "run_completed" | "run_failed", userId: string, properties?: Record<string, unknown>) {
  fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, userId, properties }),
  }).catch(() => {
    // Silent fail for analytics
  });
}

interface ChatControlsProps {
  connectedServices: ServiceWithConnectionStatus[];
  onManage: () => void;
}

/**
 * Active sources chip — read-only display of how many third-party services
 * are connected. Replaces the previous SourcePicker, whose `selected_providers`
 * payload was not consumed by the orchestrator (the model decides at runtime
 * which Composio tool to call). Clicking the chip opens /apps to manage them.
 */
function ChatControls({ connectedServices, onManage }: ChatControlsProps) {
  const count = connectedServices.length;
  const preview = connectedServices.slice(0, 3).map((s) => s.name).join(", ");
  const more = count > 3 ? ` +${count - 3}` : "";

  return (
    <div className="px-12 pt-6 pb-0 flex items-center justify-end">
      <button
        onClick={onManage}
        className="halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-9 font-mono tracking-[0.2em] uppercase border border-[var(--surface-2)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan)]/30 transition-all bg-transparent"
        title={count > 0 ? `Connectés : ${preview}${more}` : "Connecter une source"}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${count > 0 ? "bg-[var(--cykan)] halo-dot" : "bg-[var(--text-ghost)]"}`}
          aria-hidden
        />
        <span>{count} source{count !== 1 ? "s" : ""} {count > 0 ? "actives" : ""}</span>
        <span className="text-[var(--text-ghost)]" aria-hidden>→</span>
      </button>
    </div>
  );
}

const initialServices = (() => {
  const baseServices = getAllServices();
  return baseServices.map((s) => ({
    ...s,
    connectionStatus: "disconnected" as const,
  }));
})();

// Suggestion templates — surfaced when the matching service is connected.
// Each entry's `serviceId` matches the value used by `getAllServices()` /
// the connection status payload, so we only show actionable suggestions.
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

// Fallback shown when nothing is connected — generic discovery prompts.
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

function buildSuggestions(
  connectedServices: ServiceWithConnectionStatus[],
): BuiltSuggestion[] {
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

  const [services, setServices] = useState<ServiceWithConnectionStatus[]>(initialServices);
  const [connectionsLoaded, setConnectionsLoaded] = useState(false);
  const [showFocal, setShowFocal] = useState(false);
  const router = useRouter();

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

    // Detect OAuth return: ?connected=<app> means the user just authorised
    // a Composio app. Wipe the server-side discovery cache so the next chat
    // turn sees the new toolkit, then refresh the connections list, then
    // strip the query param so a refresh doesn't re-trigger the flow.
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
  }, []);


  const assistantBufferRef = useRef<string>("");
  const currentAssistantIdRef = useRef<string | null>(null);

  const connectedServices = useMemo(
    () => services.filter((s) => s.connectionStatus === "connected"),
    [services]
  );

  // Extract user email for stable dependency
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

  const chatControlsProps: ChatControlsProps = {
    connectedServices,
    onManage: () => router.push("/apps"),
  };

  if (isIdle) {
    const hour = new Date().getHours();
    const greeting =
      hour < 6 ? "Bonne nuit"
      : hour < 12 ? "Bonjour"
      : hour < 18 ? "Bon après-midi"
      : "Bonsoir";
    const connectedCount = connectedServices.length;
    // Only build suggestions once the connections list is in. Otherwise we
    // render the fallback set ("Faire une recherche web", …) for ~200ms,
    // then the matched set replaces it — flicker that the user noticed.
    const suggestions = connectionsLoaded ? buildSuggestions(connectedServices) : null;

    return (
      <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden cinematic-stage panel-enter">

        <div className="flex-1 flex flex-col items-center justify-center px-12 relative z-10">
          <div className="w-full max-w-[720px] space-y-14">
            {/* Brand block — soft Connect-style identity */}
            <div className="flex flex-col items-center gap-5 relative">
              <span
                className="chip-pill"
                style={{
                  color: "var(--cykan)",
                  borderColor: "var(--cykan-border)",
                  background: "var(--cykan-surface)",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--cykan)] halo-dot" />
                Hearst Connect
              </span>
              <h1
                className="text-5xl md:text-6xl select-none halo-cyan-md"
                style={{
                  fontWeight: 700,
                  letterSpacing: "-0.04em",
                  lineHeight: 1.05,
                  color: "var(--text)",
                }}
              >
                Hearst
              </h1>
            </div>

            {/* Contextual greeting — softer Inter typography */}
            <div className="text-center space-y-3">
              <p
                className="text-2xl md:t-28"
                style={{
                  fontWeight: 500,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.2,
                  color: "var(--text)",
                }}
              >
                {greeting}{firstName ? <span className="halo-cyan-sm">, {firstName}</span> : ""}
              </p>
              <p className="flex items-center justify-center gap-2">
                <span className="chip-pill" style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}>
                  <span className={`w-1.5 h-1.5 rounded-full ${connectedCount > 0 ? "bg-[var(--cykan)] halo-dot" : "bg-[var(--text-ghost)]"}`} />
                  {connectedCount > 0
                    ? `${connectedCount} source${connectedCount > 1 ? "s" : ""} · prêt`
                    : "Aucune source connectée"}
                </span>
              </p>
            </div>

            {/* Suggestion cards — halo-style cinematic.
                Skeleton during initial load, then real cards in one render
                so the user never sees the fallback flash through. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {suggestions === null
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={`skel-${i}`}
                      className="halo-suggestion flex items-center gap-5 px-6 py-5"
                      aria-hidden
                    >
                      <div className="halo-suggestion-logo" style={{ width: 44, height: 44 }} />
                      <div className="flex-1 min-w-0 space-y-2.5">
                        <div className="flex items-center gap-2">
                          <span className="t-9 font-mono tracking-[0.25em] uppercase opacity-30 text-[var(--cykan)]">
                            [ {String(i + 1).padStart(2, "0")} ]
                          </span>
                        </div>
                        <div className="h-3.5 chat-shimmer w-3/4" />
                        <div className="h-2.5 chat-shimmer w-1/2" />
                      </div>
                    </div>
                  ))
                : suggestions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSubmit(s.title)}
                      className="halo-suggestion group flex items-center gap-5 px-6 py-5 text-left cursor-pointer"
                    >
                      {/* Logo frame — service icon when matched, bracketed
                          numeral fallback otherwise. Same footprint either way
                          so the grid never shifts between states. */}
                      <span
                        className="halo-suggestion-logo"
                        style={{ width: 44, height: 44 }}
                        aria-hidden
                      >
                        {s.iconPath ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.iconPath}
                            alt=""
                            width={26}
                            height={26}
                            className="object-contain"
                            style={{ width: 26, height: 26 }}
                          />
                        ) : (
                          <span className="t-13 font-mono tracking-[0.15em] text-[var(--cykan)]">
                            {s.id}
                          </span>
                        )}
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 t-9 font-mono tracking-[0.3em] uppercase">
                          <span className="text-[var(--cykan)]/70 group-hover:text-[var(--cykan)] group-hover:halo-cyan-sm transition-all">
                            [ {s.id} ]
                          </span>
                          <span className="text-[var(--text-ghost)]">·</span>
                          <span className="text-[var(--text-faint)] truncate">{s.subtitle}</span>
                        </div>
                        <p
                          className="t-15 leading-snug group-hover:halo-cyan-sm transition-all"
                          style={{
                            fontWeight: 600,
                            letterSpacing: "-0.01em",
                            color: "var(--text)",
                          }}
                        >
                          {s.title}
                        </p>
                      </div>

                      <span
                        className="t-13 font-mono text-[var(--text-ghost)] group-hover:text-[var(--cykan)] group-hover:halo-cyan-sm group-hover:translate-x-1 transition-all duration-300 shrink-0"
                        aria-hidden
                      >
                        →
                      </span>
                    </button>
                  ))}
            </div>
          </div>
        </div>

        {/* Footer — pill chips Connect style */}
        <div className="px-12 pb-3 flex items-center justify-between relative z-10 select-none">
          <span
            className="chip-pill"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-ghost)",
            }}
          >
            Hearst_OS · v0.4
          </span>
          <span
            className="chip-pill"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-ghost)",
            }}
          >
            <span className="w-1 h-1 rounded-full bg-[var(--cykan)] halo-dot" />
            {connectedCount} sources · prêt
          </span>
        </div>

        <ChatControls {...chatControlsProps} />
        <ChatInput
          onSubmit={handleSubmit}
          connectedServices={connectedServices}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative bg-gradient-to-br from-[var(--surface)] via-[var(--bg-soft)] to-[var(--mat-050)]">
      {/* Principal surface: Focal Stage - takes full height when active */}
      {focal && showFocal && (() => {
        // Breadcrumb: skip the thread name when it's a near-duplicate of
        // the focal title (auto-named threads are seeded from the first
        // message, which usually matches the focal title verbatim).
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
              className="t-9 font-mono uppercase tracking-[0.3em] text-[var(--text-faint)] hover:text-[var(--text)] transition-colors shrink-0"
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
              <span className="t-9 font-mono uppercase tracking-[0.3em] text-[var(--text-faint)] group-hover:text-[var(--cykan)] group-hover:halo-cyan-sm transition-colors">
                {focal.type === "brief" ? "Active Brief" : focal.type === "report" ? "Active Report" : "Active Document"}
              </span>
              <span className="t-15 font-medium tracking-tight text-[var(--text-muted)] group-hover:translate-x-1 group-hover:text-[var(--text)] transition-all duration-300">{focal.title}</span>
            </div>
          </button>
        </div>
      )}

      {/* Chat messages - canonical renderer with conditional sizing - only render container when messages exist */}
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
      <ChatControls {...chatControlsProps} />
      <ChatInput
        onSubmit={handleSubmit}
        placeholder={focal ? "Continuer sur ce document…" : undefined}
        connectedServices={connectedServices}
      />
    </div>
  );
}
