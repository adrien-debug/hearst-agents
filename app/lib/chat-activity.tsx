"use client";

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";

/* ─── Types ─── */

export type StepStatus = "pending" | "running" | "done" | "error";

export interface PipelineStep {
  id: string;
  agent: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

export interface Artifact {
  id: string;
  type: "summary" | "list" | "report";
  title: string;
  timestamp: number;
}

export interface SessionEntry {
  id: string;
  query: string;
  steps: PipelineStep[];
  artifacts: Artifact[];
  status: "completed" | "error";
  timestamp: number;
}

export type ChatPhase = "idle" | "thinking" | "fetching" | "analyzing" | "done" | "error";

export interface ChatActivityState {
  phase: ChatPhase;
  steps: PipelineStep[];
  artifacts: Artifact[];
  query: string;
}

interface ChatActivityAPI {
  activity: ChatActivityState;
  history: SessionEntry[];
  startQuery: (query: string) => void;
  toolStarted: (tool: string) => void;
  toolDone: (tool: string, success: boolean) => void;
  responseStarted: () => void;
  complete: (artifact?: { type: Artifact["type"]; title: string }) => void;
  fail: () => void;
  reset: () => void;
}

/* ─── Pipeline template ─── */

const AGENT_MAP: Record<string, { agent: string; label: string }> = {
  get_messages: { agent: "Données", label: "Récupération des messages" },
  get_calendar_events: { agent: "Données", label: "Récupération des événements" },
  get_files: { agent: "Données", label: "Récupération des documents" },
  agent: { agent: "Autonome", label: "Agent autonome" },
};

function buildPipeline(): PipelineStep[] {
  return [
    { id: "analyze", agent: "Analyse", label: "Compréhension de la demande", status: "pending" },
    { id: "fetch", agent: "Données", label: "Récupération des données", status: "pending" },
    { id: "process", agent: "Synthèse", label: "Traitement et synthèse", status: "pending" },
  ];
}

/* ─── Artifact inference ─── */

function inferArtifact(query: string): { type: Artifact["type"]; title: string } {
  const lower = query.toLowerCase();
  if (lower.includes("résume") || lower.includes("résumer") || lower.includes("synthèse"))
    return { type: "summary", title: "Résumé généré" };
  if (lower.includes("agenda") || lower.includes("événement"))
    return { type: "list", title: "Événements récupérés" };
  if (lower.includes("fichier") || lower.includes("document"))
    return { type: "list", title: "Documents récupérés" };
  return { type: "summary", title: "Résultat généré" };
}

/* ─── Context ─── */

const INITIAL: ChatActivityState = {
  phase: "idle",
  steps: [],
  artifacts: [],
  query: "",
};

const AUTO_CLEAR_MS = 5000;
const MAX_HISTORY = 10;

let idCounter = 0;
function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}

const ChatActivityContext = createContext<ChatActivityAPI | null>(null);

export function ChatActivityProvider({ children }: { children: ReactNode }) {
  const [activity, setActivity] = useState<ChatActivityState>(INITIAL);
  const [history, setHistory] = useState<SessionEntry[]>([]);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryRef = useRef("");

  const scheduleClear = useCallback(() => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => {
      setActivity(INITIAL);
      clearTimer.current = null;
    }, AUTO_CLEAR_MS);
  }, []);

  const cancelClear = useCallback(() => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
  }, []);

  const pushHistory = useCallback((entry: SessionEntry) => {
    setHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY));
  }, []);

  const startQuery = useCallback((query: string) => {
    cancelClear();
    queryRef.current = query;
    const steps = buildPipeline();
    steps[0].status = "running";
    setActivity({ phase: "thinking", steps, artifacts: [], query });
  }, [cancelClear]);

  const toolStarted = useCallback((tool: string) => {
    setActivity((prev) => {
      const steps = prev.steps.map((s) => {
        if (s.id === "analyze" && s.status === "running") return { ...s, status: "done" as StepStatus };
        if (s.id === "fetch") {
          const info = AGENT_MAP[tool];
          return { ...s, status: "running" as StepStatus, label: info?.label ?? s.label, agent: info?.agent ?? s.agent };
        }
        return s;
      });
      return { ...prev, steps, phase: "fetching" };
    });
  }, []);

  const toolDone = useCallback((tool: string, success: boolean) => {
    setActivity((prev) => {
      const steps = prev.steps.map((s) => {
        if (s.id === "fetch") return { ...s, status: (success ? "done" : "error") as StepStatus };
        return s;
      });
      return { ...prev, steps, phase: success ? "analyzing" : "error" };
    });
  }, []);

  const responseStarted = useCallback(() => {
    setActivity((prev) => {
      const steps = prev.steps.map((s) => {
        if (s.id === "process") return { ...s, status: "running" as StepStatus };
        return s;
      });
      return { ...prev, steps, phase: "analyzing" };
    });
  }, []);

  const complete = useCallback((artifact?: { type: Artifact["type"]; title: string }) => {
    setActivity((prev) => {
      const steps = prev.steps.map((s) =>
        s.status === "running" || s.status === "pending" ? { ...s, status: "done" as StepStatus } : s,
      );
      const art = artifact ?? inferArtifact(prev.query);
      const newArtifact: Artifact = {
        id: uid("art"),
        ...art,
        timestamp: Date.now(),
      };
      const artifacts = [...prev.artifacts, newArtifact];

      pushHistory({
        id: uid("session"),
        query: prev.query,
        steps,
        artifacts,
        status: "completed",
        timestamp: Date.now(),
      });

      return { ...prev, steps, artifacts, phase: "done" as ChatPhase };
    });
    scheduleClear();
  }, [scheduleClear, pushHistory]);

  const fail = useCallback(() => {
    setActivity((prev) => {
      const steps = prev.steps.map((s) =>
        s.status === "running" ? { ...s, status: "error" as StepStatus } : s,
      );

      pushHistory({
        id: uid("session"),
        query: prev.query,
        steps,
        artifacts: [],
        status: "error",
        timestamp: Date.now(),
      });

      return { ...prev, steps, phase: "error" as ChatPhase };
    });
    scheduleClear();
  }, [scheduleClear, pushHistory]);

  const reset = useCallback(() => {
    setActivity(INITIAL);
  }, []);

  return (
    <ChatActivityContext.Provider value={{
      activity,
      history,
      startQuery,
      toolStarted,
      toolDone,
      responseStarted,
      complete,
      fail,
      reset,
    }}>
      {children}
    </ChatActivityContext.Provider>
  );
}

export function useChatActivity(): ChatActivityAPI {
  const ctx = useContext(ChatActivityContext);
  if (!ctx) throw new Error("useChatActivity must be used within ChatActivityProvider");
  return ctx;
}
