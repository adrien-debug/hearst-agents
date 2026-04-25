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
import { CapabilityBlockedBanner } from "./components/CapabilityBlockedBanner";
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

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

// ChatControls component defined outside to avoid "created during render" warning
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
  capabilityServices,
  connectedServices,
  services,
  sourceSelection,
  surface,
  onConnect,
  onDismissBanner,
  onCapabilityChange,
  onNavigate,
  onSourceChange,
}: ChatControlsProps) {
  return (
    <div className="px-4 pt-3 space-y-2">
      {/* Blocked Capability Banner */}
      {showBlockedBanner && (
        <CapabilityBlockedBanner
          capability={capabilityMode}
          requiredServices={capabilityServices}
          connectedServices={connectedServices}
          onConnect={onConnect}
          onDismiss={onDismissBanner}
        />
      )}

      {/* Source Picker & Capability Tabs */}
      <div className="flex items-center justify-between">
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

// Initialize services with loading state — real status fetched on mount
const initialServices = (() => {
  const baseServices = [...getAllServices(), ...getNangoServices()];
  return baseServices.map((s) => ({
    ...s,
    connectionStatus: "disconnected" as const,
  }));
})();

// Service ID → Provider ID mapping for OAuth
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
  const messagesRaw = useNavigationStore((s) =>
    activeThreadId ? s.messages[activeThreadId] : undefined
  );
  const messages = useMemo(() => messagesRaw ?? [], [messagesRaw]);
  const addMessageToThread = useNavigationStore((s) => s.addMessageToThread);
  const updateMessageInThread = useNavigationStore((s) => s.updateMessageInThread);
  const firstName = session?.user?.name?.split(" ")[0];

  // Rehydrate focal state from right-panel API on mount and thread switch
  useEffect(() => {
    if (!activeThreadId) {
      hydrateThreadState(null, []);
      return;
    }

    const fetchThreadState = async () => {
      try {
        const res = await fetch(`/api/v2/right-panel?thread_id=${encodeURIComponent(activeThreadId)}`);
        if (!res.ok) {
          console.error("[HomePage] Failed to fetch right-panel:", res.status);
          // Silent fail for right-panel — user sees empty state, not blocking
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
        // Silent fail — user can continue with chat
        hydrateThreadState(null, []);
      }
    };

    fetchThreadState();
    // No polling here — live updates come via SSE through setFocal
  }, [activeThreadId, hydrateThreadState]);

  // Services state with real connection status
  const [services, setServices] = useState<ServiceWithConnectionStatus[]>(initialServices);
  const [capabilityMode, setCapabilityMode] = useState<CapabilityMode>(
    getCapabilityFromSurface(surface)
  );
  const [sourceSelection, setSourceSelection] = useState<SourceSelection>(
    getDefaultSelection(initialServices)
  );
  const [showBlockedBanner, setShowBlockedBanner] = useState(false);
  const [showFocal, setShowFocal] = useState(false);

  // Fetch real connection status on mount
  useEffect(() => {
    async function loadConnections() {
      try {
        const res = await fetch("/api/v2/user/connections", { credentials: "include" });
        if (!res.ok) {
          toast.warning("Connecteurs indisponibles", "Impossible de charger l'état des connexions");
          return;
        }
        const data = await res.json();
        if (data.services && Array.isArray(data.services)) {
          setServices(data.services as ServiceWithConnectionStatus[]);
          // Update source selection with connected services
          const connected = data.services.filter(
            (s: ServiceWithConnectionStatus) => s.connectionStatus === "connected"
          );
          if (connected.length > 0) {
            setSourceSelection(getDefaultSelection(connected));
          }
        }
        console.log(`[HomePage] Loaded ${data.meta?.connected || 0}/${data.meta?.total || 0} connected services`);
      } catch (_err) {
        toast.warning("Connecteurs temporairement indisponibles");
      }
    }
    loadConnections();
  }, []);

  // Use refs to track previous values without triggering effects
  const prevSurfaceRef = useRef(surface);
  const prevCapabilityRef = useRef(capabilityMode);

  // Update capability mode when surface changes - using setTimeout to break sync cycle
  useEffect(() => {
    if (surface !== prevSurfaceRef.current) {
      prevSurfaceRef.current = surface;
      const newMode = getCapabilityFromSurface(surface);
      if (newMode !== prevCapabilityRef.current) {
        prevCapabilityRef.current = newMode;
        // Use timeout to avoid sync setState warning
        setTimeout(() => setCapabilityMode(newMode), 0);
      }
    }
  }, [surface]);

  // Update blocked banner when capability or services change
  const prevServicesRef = useRef(services);
  useEffect(() => {
    if (services !== prevServicesRef.current || capabilityMode !== prevCapabilityRef.current) {
      prevServicesRef.current = services;
      prevCapabilityRef.current = capabilityMode;
      const connectedServices = services.filter((s) => s.connectionStatus === "connected");
      const isAvailable = isCapabilityAvailable(capabilityMode, connectedServices);
      const shouldShow = !isAvailable && capabilityMode !== "general";
      // Only update if different, using timeout to avoid sync warning
      setTimeout(() => {
        setShowBlockedBanner((prev) => (prev !== shouldShow ? shouldShow : prev));
      }, 0);
    }
  }, [capabilityMode, services]);

  const assistantBufferRef = useRef<string>("");
  const currentAssistantIdRef = useRef<string | null>(null);

  // Connected services for SourcePicker
  const connectedServices = useMemo(
    () => services.filter((s) => s.connectionStatus === "connected"),
    [services]
  );

  // Services matching current capability
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

  const handleSubmit = useCallback(async (message: string) => {
    if (!activeThreadId) return;

    // Client token for correlation (not the canonical run_id)
    const clientToken = `client-${Date.now()}`;

    // Add user message to current thread
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
    };
    addMessageToThread(activeThreadId, userMessage);

    // Track first message (activation metric)
    if (messages.length === 0) {
      trackAnalytics("first_message_sent", session?.user?.email || "anonymous", {
        threadId: activeThreadId,
        provider: capabilityMode,
      });
    }

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

    // Build bounded conversation history (~10 last messages, user/assistant only, non-empty)
    const recentMessages = messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    // Start run with client token (will be replaced by server run_id on run_started)
    startRun(clientToken);

    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          surface,
          thread_id: activeThreadId,
          conversation_id: activeThreadId, // Canonique: thread_id === conversation_id
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

            // Capture canonical run_id from run_started event
            if (event.type === "run_started" && event.run_id) {
              canonicalRunId = event.run_id as string;
              console.log(`[Chat] Canonical run_id established: ${canonicalRunId}`);
            }

            // Log warning if event has mismatched run_id
            if (event.run_id && canonicalRunId && event.run_id !== canonicalRunId) {
              console.warn(`[Chat] Event run_id mismatch: expected ${canonicalRunId}, got ${event.run_id}`);
            }

            // Handle text_delta events for streaming assistant responses
            if (event.type === "text_delta" && event.delta) {
              assistantBufferRef.current += event.delta;
              updateMessageInThread(
                activeThreadId,
                currentAssistantIdRef.current!,
                assistantBufferRef.current
              );
            }

            // Use canonical run_id if available, otherwise client token
            const eventRunId = (event.run_id as string) || canonicalRunId || clientToken;
            addEvent({ ...event, run_id: eventRunId });
          } catch (parseErr) {
            console.error("[Chat] Failed to parse SSE event:", parseErr);
            // Silently ignore parse errors during streaming
          }
        }
      }

      // Log final canonical run_id for debugging
      if (canonicalRunId) {
        console.log(`[Chat] Run completed with canonical id: ${canonicalRunId}`);
      }

      // Track run completion
      trackAnalytics("run_completed", session?.user?.email || "anonymous", {
        runId: canonicalRunId || clientToken,
        provider: capabilityMode,
        messageCount: messages.length,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Échec de la connexion";
      console.error("[Chat] Orchestration failed:", err);
      toast.error("Erreur de connexion", errorMsg);
      addEvent({ type: "run_failed", error: errorMsg, run_id: clientToken });

      // Track run failure
      trackAnalytics("run_failed", session?.user?.email || "anonymous", {
        runId: clientToken,
        provider: capabilityMode,
        error: errorMsg,
      });
    }
  }, [surface, activeThreadId, capabilityMode, sourceSelection, messages, addEvent, startRun, addMessageToThread, updateMessageInThread]);

  const handleCapabilityChange = useCallback((mode: CapabilityMode) => {
    setCapabilityMode(mode);
  }, []);

  const handleNavigate = useCallback((newSurface: Surface) => {
    setSurface(newSurface);
  }, [setSurface]);

  const handleConnect = useCallback(async (serviceId: string) => {
    const provider = getProviderForService(serviceId);
    if (!provider) {
      console.error(`[HomePage] No provider mapping for service: ${serviceId}`);
      return;
    }

    console.log(`[HomePage] Initiating OAuth for ${serviceId} via ${provider}`);

    try {
      // Get OAuth config from backend
      const res = await fetch("/api/nango/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider }),
      });

      if (!res.ok) {
        const errData = await res.json();
        toast.error("Échec de connexion", errData.message || "Configuration Nango manquante");
        return;
      }

      const data = await res.json();
      if (!data.success || !data.config) {
        toast.error("Configuration invalide", "Impossible d'initialiser la connexion");
        return;
      }

      // Redirect to apps page with pending connection
      // The actual OAuth popup will be handled by Nango SDK on the apps page
      console.log(`[HomePage] OAuth ready for ${provider}, redirecting to App Hub`);
      window.location.href = `/apps?connecting=${encodeURIComponent(serviceId)}&provider=${encodeURIComponent(provider)}`;
    } catch (_err) {
      toast.error("Erreur de connexion", "Impossible d'initier la connexion OAuth");
    }
  }, []);

  const handleDismissBanner = useCallback(() => {
    setShowBlockedBanner(false);
  }, []);

  const isIdle = coreState === "idle" && messages.length === 0 && !focal;

  // Auto-show focal when it first appears (user can then close it)
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
    return (
      <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
        {/* Halo idle glow background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 50% 40%, rgba(0, 229, 255, 0.06) 0%, transparent 60%)",
          }}
        />

        <div className="flex-1 flex flex-col items-center justify-center px-8 relative z-10">
          <div className="text-center space-y-5">
            {/* Halo-style greeting with gradient accent */}
            <div
              className="inline-flex items-center gap-3 px-4 py-2 mb-2"
              style={{
                background: "linear-gradient(180deg, rgba(0,229,255,0.05) 0%, transparent 100%)",
                borderBottom: "1px solid rgba(0,229,255,0.15)",
              }}
            >
              <div
                className="w-5 h-5 flex items-center justify-center text-xs font-bold"
                style={{
                  background: "var(--cykan)",
                  color: "#000",
                }}
              >
                H
              </div>
              <span className="halo-mono-label" style={{ color: "var(--text-faint)" }}>Hearst OS</span>
            </div>

            <h1 className="halo-title-lg">{greeting()}{firstName ? `, ${firstName}` : ""}</h1>
            <p className="halo-body max-w-md mx-auto">Comment puis-je vous aider aujourd&apos;hui ?</p>

            {/* Suggestion chips — Halo style */}
            <div className="flex flex-wrap justify-center gap-2 mt-10">
              {["Résumer mes emails", "Planifier une réunion", "Analyser un document", "Créer un rapport"].map((s) => (
                <button
                  key={s}
                  onClick={() => handleSubmit(s)}
                  className="px-3 py-1.5 text-xs border border-[var(--line)] text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--cykan)]/30 hover:bg-[var(--cykan)]/[0.04] transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        <ChatControls {...chatControlsProps} />
        <ChatInput
          onSubmit={handleSubmit}
          connectedServices={connectedServices}
        />
      </div>
    );
  }

  // Chat-first with focal as principal surface when present
  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Principal surface: Focal Stage - takes full height when active */}
      {focal && showFocal && (
        <div className="flex-1 flex flex-col min-h-0 border-b border-[var(--line)]">
          {/* Focal header - minimal, contextual */}
          <div className="flex items-center justify-between px-4 py-2 bg-white/[0.02] border-b border-[var(--line)] flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{focal.type}</span>
              <span className="text-xs text-[var(--text-faint)]">·</span>
              <span className="text-xs text-[var(--text-soft)] truncate max-w-[300px]">{focal.title}</span>
            </div>
            <button
              onClick={() => setShowFocal(false)}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] px-2 py-1 rounded hover:bg-white/[0.05] transition-colors"
              title="Minimiser (rester dans le contexte)"
            >
              Minimiser ✕
            </button>
          </div>
          {/* Focal content - principal reading surface */}
          <div className="flex-1 overflow-y-auto">
            <FocalStage />
          </div>
        </div>
      )}

      {/* Collapsed focal indicator - contextual chip */}
      {focal && !showFocal && (
        <div className="flex-shrink-0 px-4 py-2 border-b border-[var(--line)] bg-white/[0.02]">
          <button
            onClick={() => setShowFocal(true)}
            className="inline-flex items-center gap-2 text-xs text-[var(--cykan)] hover:text-[var(--text)] transition-colors"
          >
            <span>◉</span>
            <span className="text-[var(--text-soft)]">
              {focal.type === "brief" ? "Synthèse" : focal.type === "report" ? "Rapport" : "Document"} en cours
            </span>
            <span className="text-[var(--text-faint)]">·</span>
            <span className="truncate max-w-[200px]">{focal.title}</span>
            <span className="ml-2 text-[var(--cykan)]">▲</span>
          </button>
        </div>
      )}

      {/* Chat messages - canonical renderer with conditional sizing - only render container when messages exist */}
      {messages.length > 0 && (
        <div className={focal && showFocal ? "flex-shrink-0 h-[180px] border-b border-[var(--line)]" : "flex-1 min-h-0"}>
          <ChatMessages
            messages={messages}
            compact={!!(focal && showFocal)}
            className={focal && showFocal ? "h-full overflow-y-auto px-4 py-3 space-y-3" : "h-full overflow-y-auto px-4 py-6 space-y-4"}
          />
        </div>
      )}
      <ChatControls {...chatControlsProps} />
      <ChatInput
        onSubmit={handleSubmit}
        placeholder={focal ? `Continuer sur "${focal.title.slice(0, 30)}..."` : undefined}
        connectedServices={connectedServices}
      />
    </div>
  );
}
