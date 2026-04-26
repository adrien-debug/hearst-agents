"use client";

import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useFocalStore } from "@/stores/focal";
import { useRuntimeStore } from "@/stores/runtime";
import { useNavigationStore } from "@/stores/navigation";
import type { Message, Surface, RightPanelData } from "@/lib/core/types";
import { mapFocalObject, mapFocalObjects } from "@/lib/core/types/focal";
import { FocalStage } from "./components/FocalStage";
import { ChatInput } from "./components/ChatInput";
import { ChatMessages } from "./components/ChatMessages";
import { CapabilityTabs, type CapabilityMode, getCapabilityFromSurface, isCapabilityAvailable } from "./components/CapabilityTabs";
import { SourcePicker, type SourceSelection, getDefaultSelection } from "./components/SourcePicker";
import { Breadcrumb, type Crumb } from "./components/Breadcrumb";
import { getAllServices } from "@/lib/integrations/catalog";
import { getNangoServices } from "@/lib/integrations/catalog.generated";
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
  showBlockedBanner: boolean;
  capabilityMode: CapabilityMode;
  capabilityServices: ServiceWithConnectionStatus[];
  connectedServices: ServiceWithConnectionStatus[];
  services: ServiceWithConnectionStatus[];
  sourceSelection: SourceSelection;
  surface: Surface;
  onConnect: (serviceId: string) => void;
  onDismissBanner: () => void;
  onCapabilityChange: (mode: CapabilityMode) => void;
  onNavigate: (newSurface: Surface) => void;
  onSourceChange: (selection: SourceSelection) => void;
}

function ChatControls({
  showBlockedBanner,
  capabilityMode,
  connectedServices,
  services,
  sourceSelection,
  surface,
  onDismissBanner,
  onCapabilityChange,
  onNavigate,
  onSourceChange,
}: ChatControlsProps) {
  return (
    <div className="px-12 pt-10 space-y-8 bg-gradient-to-b from-[var(--surface-1)] to-transparent">
      {/* Blocked Capability Banner */}
      {showBlockedBanner && (
        <div className="bg-gradient-to-r from-[var(--danger)]/10 to-transparent border-l-2 border-[var(--danger)] p-5 flex items-center justify-between group rounded-r-sm">
          <div className="flex items-center gap-6">
            <span className="t-10 font-mono font-bold text-[var(--danger)] uppercase tracking-[0.2em]">Access Denied</span>
            <p className="text-sm font-medium text-[var(--text)] tracking-tight">
              {capabilityMode} capability requires connection
            </p>
          </div>
          <button
            onClick={onDismissBanner}
            className="t-10 font-mono text-[var(--text-faint)] hover:text-[var(--text)] transition-colors tracking-[0.2em]"
          >
            Close [x]
          </button>
        </div>
      )}

      {/* Source Picker & Capability Tabs */}
      <div className="flex items-center justify-between border-b border-[var(--line-strong)] pb-8">
        <CapabilityTabs
          connectedServices={connectedServices}
          activeMode={capabilityMode}
          onModeChange={onCapabilityChange}
          onNavigate={onNavigate}
          compact
        />
        <SourcePicker
          availableServices={services}
          connectedServices={connectedServices}
          currentSurface={surface}
          selection={sourceSelection}
          onChange={onSourceChange}
          compact
        />
      </div>
    </div>
  );
}

const initialServices = (() => {
  const baseServices = [...getAllServices(), ...getNangoServices()];
  return baseServices.map((s) => ({
    ...s,
    connectionStatus: "disconnected" as const,
  }));
})();

function getProviderForService(serviceId: string): string | null {
  const map: Record<string, string> = {
    gmail: "google",
    calendar: "google",
    drive: "google",
    slack: "slack",
    notion: "notion",
    github: "github",
    hubspot: "hubspot",
    jira: "jira",
    linear: "linear",
    stripe: "stripe",
    figma: "figma",
    airtable: "airtable",
    zapier: "zapier",
  };
  return map[serviceId] || null;
}

export default function HomePage() {
  const { data: session } = useSession();
  const focal = useFocalStore((s) => s.focal);
  const hydrateThreadState = useFocalStore((s) => s.hydrateThreadState);
  const coreState = useRuntimeStore((s) => s.coreState);
  const addEvent = useRuntimeStore((s) => s.addEvent);
  const startRun = useRuntimeStore((s) => s.startRun);
  const surface = useNavigationStore((s) => s.surface);
  const setSurface = useNavigationStore((s) => s.setSurface);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const activeThread = useNavigationStore((s) =>
    activeThreadId ? s.threads.find((t) => t.id === activeThreadId) : undefined
  );
  const messagesRaw = useNavigationStore((s) =>
    activeThreadId ? s.messages[activeThreadId] : undefined
  );
  const messages = useMemo(() => messagesRaw ?? [], [messagesRaw]);
  const addMessageToThread = useNavigationStore((s) => s.addMessageToThread);
  const updateMessageInThread = useNavigationStore((s) => s.updateMessageInThread);
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
  const [capabilityMode, setCapabilityMode] = useState<CapabilityMode>(
    getCapabilityFromSurface(surface)
  );
  const [sourceSelection, setSourceSelection] = useState<SourceSelection>(
    getDefaultSelection(initialServices)
  );
  const [showBlockedBanner, setShowBlockedBanner] = useState(false);
  const [showFocal, setShowFocal] = useState(false);

  useEffect(() => {
    async function loadConnections() {
      try {
        const res = await fetch("/api/v2/user/connections", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.services && Array.isArray(data.services)) {
          setServices(data.services as ServiceWithConnectionStatus[]);
          const connected = data.services.filter(
            (s: ServiceWithConnectionStatus) => s.connectionStatus === "connected"
          );
          if (connected.length > 0) {
            setSourceSelection(getDefaultSelection(connected));
          }
        }
      } catch (_err) {}
    }
    loadConnections();
  }, []);

  const prevSurfaceRef = useRef(surface);
  const prevCapabilityRef = useRef(capabilityMode);

  useEffect(() => {
    if (surface !== prevSurfaceRef.current) {
      prevSurfaceRef.current = surface;
      const newMode = getCapabilityFromSurface(surface);
      if (newMode !== prevCapabilityRef.current) {
        prevCapabilityRef.current = newMode;
        setTimeout(() => setCapabilityMode(newMode), 0);
      }
    }
  }, [surface]);

  const prevServicesRef = useRef(services);
  useEffect(() => {
    if (services !== prevServicesRef.current || capabilityMode !== prevCapabilityRef.current) {
      prevServicesRef.current = services;
      prevCapabilityRef.current = capabilityMode;
      const connectedServices = services.filter((s) => s.connectionStatus === "connected");
      const isAvailable = isCapabilityAvailable(capabilityMode, connectedServices);
      const shouldShow = !isAvailable && capabilityMode !== "general";
      setTimeout(() => {
        setShowBlockedBanner((prev) => (prev !== shouldShow ? shouldShow : prev));
      }, 0);
    }
  }, [capabilityMode, services]);

  const assistantBufferRef = useRef<string>("");
  const currentAssistantIdRef = useRef<string | null>(null);

  const connectedServices = useMemo(
    () => services.filter((s) => s.connectionStatus === "connected"),
    [services]
  );

  const capabilityServices = useMemo(() => {
    const capabilityMap: Record<string, string> = {
      messaging: "messaging",
      calendar: "calendar",
      files: "files",
      crm: "crm",
      support: "support",
      finance: "finance",
      developer: "developer_tools",
      design: "design",
    };
    const requiredCap = capabilityMap[capabilityMode];
    if (!requiredCap) return services;
    return services.filter((s) => s.capabilities.includes(requiredCap as ServiceWithConnectionStatus["capabilities"][number]));
  }, [services, capabilityMode]);

  // Extract user email for stable dependency
  const userEmail = session?.user?.email || "anonymous";

  const handleSubmit = useCallback(async (message: string) => {
    if (!activeThreadId) return;
    const clientToken = `client-${Date.now()}`;
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
    };
    addMessageToThread(activeThreadId, userMessage);

    if (messages.length === 0) {
      trackAnalytics("first_message_sent", userEmail, {
        threadId: activeThreadId,
        provider: capabilityMode,
      });
    }

    assistantBufferRef.current = "";
    currentAssistantIdRef.current = `assistant-${Date.now()}`;

    const assistantMessage: Message = {
      id: currentAssistantIdRef.current,
      role: "assistant",
      content: "",
    };
    addMessageToThread(activeThreadId, assistantMessage);

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
          thread_id: activeThreadId,
          conversation_id: activeThreadId,
          history: recentMessages,
          capability_mode: capabilityMode,
          selected_providers: sourceSelection.providers,
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
                activeThreadId,
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
        provider: capabilityMode,
        messageCount: messages.length,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Échec de la connexion";
      toast.error("Erreur de connexion", errorMsg);
      addEvent({ type: "run_failed", error: errorMsg, run_id: clientToken });
      trackAnalytics("run_failed", userEmail, {
        runId: clientToken,
        provider: capabilityMode,
        error: errorMsg,
      });
    }
  }, [surface, activeThreadId, capabilityMode, sourceSelection, messages, addEvent, startRun, addMessageToThread, updateMessageInThread, userEmail]);

  const handleCapabilityChange = useCallback((mode: CapabilityMode) => {
    setCapabilityMode(mode);
  }, []);

  const handleNavigate = useCallback((newSurface: Surface) => {
    setSurface(newSurface);
  }, [setSurface]);

  const handleConnect = useCallback(async (serviceId: string) => {
    const provider = getProviderForService(serviceId);
    if (!provider) return;
    try {
      const res = await fetch("/api/nango/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !data.config) return;
      window.location.href = `/apps?connecting=${encodeURIComponent(serviceId)}&provider=${encodeURIComponent(provider)}`;
    } catch (_err) {}
  }, []);

  const handleDismissBanner = useCallback(() => {
    setShowBlockedBanner(false);
  }, []);

  const isIdle = coreState === "idle" && messages.length === 0 && !focal;

  const focalIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (focal && focal.id !== focalIdRef.current) {
      focalIdRef.current = focal.id;
      setShowFocal(true);
    }
  }, [focal]);

  const chatControlsProps: ChatControlsProps = {
    showBlockedBanner,
    capabilityMode,
    capabilityServices,
    connectedServices,
    services,
    sourceSelection,
    surface,
    onConnect: handleConnect,
    onDismissBanner: handleDismissBanner,
    onCapabilityChange: handleCapabilityChange,
    onNavigate: handleNavigate,
    onSourceChange: setSourceSelection,
  };

  if (isIdle) {
    const hour = new Date().getHours();
    const greeting =
      hour < 6 ? "Bonne nuit"
      : hour < 12 ? "Bonjour"
      : hour < 18 ? "Bon après-midi"
      : "Bonsoir";
    const connectedCount = connectedServices.length;
    const suggestions = [
      { id: "01", title: "Résumer mes emails", subtitle: "Synthèse 24h · Gmail" },
      { id: "02", title: "Planifier une réunion", subtitle: "Trouver un créneau · Calendar" },
      { id: "03", title: "Analyser un document", subtitle: "Lecture & synthèse · Drive" },
      { id: "04", title: "Créer un rapport", subtitle: "Brief structuré · Multi-source" },
    ];

    return (
      <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden bg-gradient-to-b from-[var(--mat-050)] via-[var(--bg-soft)] to-[var(--mat-050)]">
        <div className="absolute inset-0 bg-hero-aura" />

        <div className="flex-1 flex flex-col items-center justify-center px-12 relative z-10">
          <div className="w-full max-w-[640px] space-y-16">
            {/* Wordmark — refined typographic identity with cyan halo */}
            <div className="flex flex-col items-center gap-6 relative">
              <span className="t-9 font-mono tracking-[0.3em] text-[var(--cykan)] uppercase halo-cyan-sm">
                Ghost Protocol
              </span>
              <h1 className="t-30 font-extralight tracking-[0.3em] text-[var(--text)] uppercase select-none halo-cyan-lg">
                Hearst
              </h1>
              <div className="h-px w-32 halo-rule" />
            </div>

            {/* Contextual greeting */}
            <div className="text-center space-y-3">
              <p className="t-24 font-light text-[var(--text)] tracking-tight">
                {greeting}{firstName ? <span className="halo-cyan-sm">, {firstName}</span> : ""}
              </p>
              <p className="t-11 font-mono tracking-[0.2em] text-[var(--text-faint)] uppercase flex items-center justify-center gap-3">
                <span className="inline-block w-1 h-1 rounded-full bg-[var(--cykan)] halo-dot" />
                {connectedCount > 0
                  ? `${connectedCount} source${connectedCount > 1 ? "s" : ""} connectée${connectedCount > 1 ? "s" : ""} · prêt à exécuter`
                  : "Aucune source · connecte-en une pour commencer"}
              </p>
            </div>

            {/* Editorial numbered suggestion cards */}
            <div className="grid grid-cols-2 gap-px bg-[var(--surface-2)] border border-[var(--surface-2)]">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSubmit(s.title)}
                  className="halo-card group relative flex items-start gap-5 p-6 text-left bg-[var(--mat-050)] hover:bg-[var(--surface-1)] overflow-hidden"
                >
                  <span className="halo-on-group-hover t-11 font-mono tracking-[0.2em] text-[var(--cykan)] opacity-50 group-hover:opacity-100 transition-all pt-1">
                    {s.id}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="t-13 font-medium tracking-tight text-[var(--text-soft)] group-hover:text-[var(--text)] transition-colors">
                      {s.title}
                    </p>
                    <p className="t-10 font-mono tracking-[0.2em] text-[var(--text-faint)] mt-1.5 uppercase">
                      {s.subtitle}
                    </p>
                  </div>
                  <span className="halo-on-group-hover absolute top-6 right-6 t-11 font-mono text-[var(--text-ghost)] group-hover:text-[var(--cykan)] group-hover:translate-x-1 transition-all duration-300">
                    →
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Telemetry footer — Ghost Protocol signature */}
        <div className="px-12 pb-2 flex items-center justify-between t-9 font-mono tracking-[0.3em] text-[var(--text-ghost)] uppercase relative z-10 select-none">
          <span>Hearst_OS · v0.4</span>
          <span className="flex items-center gap-3">
            <span className="w-1 h-1 rounded-full bg-[var(--cykan)] halo-dot" />
            {connectedCount} sources · ready
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
        const trail: Crumb[] = [
          { label: activeThread?.name || "Hearst" },
          { label: `${focal.type}_HUD` },
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
          />
        </div>
      )}
      <ChatControls {...chatControlsProps} />
      <ChatInput
        onSubmit={handleSubmit}
        placeholder={focal ? `CONTINUE_ON_CONTEXT_` : undefined}
        connectedServices={connectedServices}
      />
    </div>
  );
}
