"use client";

import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useFocalStore, type FocalObject, type FocalType, type FocalStatus } from "@/stores/focal";
import { useRuntimeStore } from "@/stores/runtime";
import { useNavigationStore, type Message, type Surface } from "@/stores/navigation";
import { FocalStage } from "./components/FocalStage";
import { ChatInput } from "./components/ChatInput";
import { ChatMessages } from "./components/ChatMessages";
import { CapabilityTabs, type CapabilityMode, getCapabilityFromSurface } from "./components/CapabilityTabs";
import { SourcePicker, type SourceSelection, getDefaultSelection } from "./components/SourcePicker";
import { CapabilityBlockedBanner } from "./components/CapabilityBlockedBanner";
import { getAllServices } from "@/lib/integrations/catalog";
import { getNangoServices } from "@/lib/integrations/catalog.generated";
import type { ServiceWithConnectionStatus } from "@/lib/integrations/types";
import { isCapabilityAvailable } from "./components/CapabilityTabs";
import type { RightPanelData } from "@/lib/ui/right-panel/types";

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

// Initialize services only once
const initialServices = (() => {
  const baseServices = [...getAllServices(), ...getNangoServices()];
  return baseServices.map((s) => ({
    ...s,
    connectionStatus: "disconnected" as const,
  }));
})();

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
          hydrateThreadState(null, []);
          return;
        }

        const data: RightPanelData = await res.json();

        // Map focalObject to FocalObject type
        const mapFocalObject = (obj: unknown): FocalObject | null => {
          if (!obj || typeof obj !== "object") return null;
          const o = obj as Record<string, unknown>;

          const objectType = o.objectType as string | undefined;
          if (!objectType) return null;

          const validTypes: FocalType[] = [
            "message_draft", "message_receipt", "brief", "outline",
            "report", "doc", "watcher_draft", "watcher_active",
            "mission_draft", "mission_active"
          ];
          const type = validTypes.includes(objectType as FocalType) ? (objectType as FocalType) : "brief";

          const validStatuses: FocalStatus[] = [
            "composing", "ready", "awaiting_approval", "delivering",
            "delivered", "active", "paused", "failed"
          ];
          const status = validStatuses.includes(o.status as FocalStatus) ? (o.status as FocalStatus) : "ready";

          const createdAt = typeof o.createdAt === "number" ? o.createdAt : Date.now();
          const updatedAt = typeof o.updatedAt === "number" ? o.updatedAt : Date.now();

          // Extract body from summary or sections
          let body = (o.body as string) || (o.summary as string) || "";
          if (!body && Array.isArray(o.sections) && o.sections.length > 0) {
            const firstSection = o.sections[0] as Record<string, string>;
            body = firstSection?.body || "";
          }

          return {
            id: (o.id as string) || `focal-${Date.now()}`,
            type,
            status,
            title: (o.title as string) || "Untitled",
            body,
            summary: (o.summary as string) || undefined,
            sections: Array.isArray(o.sections) ? o.sections as { heading?: string; body: string }[] : undefined,
            wordCount: typeof o.wordCount === "number" ? o.wordCount : undefined,
            provider: (o.providerId as string) || (o.provider as string) || undefined,
            createdAt,
            updatedAt,
          };
        };

        // Map secondaryObjects
        const secondary: FocalObject[] = [];
        if (data.secondaryObjects && Array.isArray(data.secondaryObjects)) {
          for (const obj of data.secondaryObjects) {
            const mapped = mapFocalObject(obj);
            if (mapped) secondary.push(mapped);
          }
        }

        const mappedFocal = data.focalObject ? mapFocalObject(data.focalObject) : null;
        hydrateThreadState(mappedFocal, secondary.slice(0, 3));
      } catch (err) {
        console.error("[HomePage] Error fetching thread state:", err);
        hydrateThreadState(null, []);
      }
    };

    fetchThreadState();
    // No polling here — live updates come via SSE through setFocal
  }, [activeThreadId, hydrateThreadState]);

  // Services state - initialized directly without useEffect
  const [services] = useState<ServiceWithConnectionStatus[]>(initialServices);
  const [capabilityMode, setCapabilityMode] = useState<CapabilityMode>(
    getCapabilityFromSurface(surface)
  );
  const [sourceSelection, setSourceSelection] = useState<SourceSelection>(
    getDefaultSelection(initialServices)
  );
  const [showBlockedBanner, setShowBlockedBanner] = useState(false);

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

    // Build bounded conversation history (~10 last messages, user/assistant only, non-empty)
    const recentMessages = messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    startRun(runId);
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
  }, [surface, activeThreadId, capabilityMode, sourceSelection, addEvent, startRun, addMessageToThread, updateMessageInThread]);

  const handleCapabilityChange = useCallback((mode: CapabilityMode) => {
    setCapabilityMode(mode);
  }, []);

  const handleNavigate = useCallback((newSurface: Surface) => {
    setSurface(newSurface);
  }, [setSurface]);

  const handleConnect = useCallback(async (serviceId: string) => {
    console.log("Connecting to:", serviceId);
    // TODO: Redirect to OAuth flow
    // window.location.href = `/api/nango/connect?provider=${serviceId}`;
  }, []);

  const handleDismissBanner = useCallback(() => {
    setShowBlockedBanner(false);
  }, []);

  const isIdle = !focal && coreState === "idle" && messages.length === 0;
  const isRunning = !focal && coreState !== "idle";
  const hasConversation = messages.length > 0 && !focal;

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
        <ChatControls {...chatControlsProps} />
        <ChatInput
          onSubmit={handleSubmit}
          connectedServices={connectedServices}
        />
      </div>
    );
  }

  if (isRunning || hasConversation) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <ChatMessages messages={messages} />
        <ChatControls {...chatControlsProps} />
        <ChatInput
          onSubmit={handleSubmit}
          connectedServices={connectedServices}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <FocalStage />
      <ChatControls {...chatControlsProps} />
      <ChatInput
        onSubmit={handleSubmit}
        placeholder={`Continuer sur "${focal?.title.slice(0, 30)}..."`}
        connectedServices={connectedServices}
      />
    </div>
  );
}
