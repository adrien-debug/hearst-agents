"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface StreamEvent {
  type: string;
  timestamp: number;
  [key: string]: unknown;
}

type Listener = (event: StreamEvent) => void;

interface RunStreamContextValue {
  push: (event: StreamEvent) => void;
  subscribe: (fn: Listener) => () => void;
  connected: boolean;
  setConnected: (v: boolean) => void;
  liveEvents: StreamEvent[];
}

const RunStreamCtx = createContext<RunStreamContextValue | null>(null);

const MAX_LIVE_EVENTS = 30;

export function RunStreamProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef<Set<Listener>>(new Set());
  const [liveEvents, setLiveEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);

  const push = useCallback((event: StreamEvent) => {
    const enriched = { ...event, timestamp: event.timestamp || Date.now() };
    setLiveEvents((prev) => [enriched, ...prev].slice(0, MAX_LIVE_EVENTS));
    for (const fn of listenersRef.current) {
      try { fn(enriched); } catch { /* ignore */ }
    }
  }, []);

  const subscribe = useCallback((fn: Listener) => {
    listenersRef.current.add(fn);
    return () => { listenersRef.current.delete(fn); };
  }, []);

  return (
    <RunStreamCtx.Provider value={{ push, subscribe, connected, setConnected, liveEvents }}>
      {children}
    </RunStreamCtx.Provider>
  );
}

export function useRunStream(): RunStreamContextValue {
  const ctx = useContext(RunStreamCtx);
  if (!ctx) throw new Error("useRunStream must be used inside RunStreamProvider");
  return ctx;
}

export function useRunStreamOptional(): RunStreamContextValue | null {
  return useContext(RunStreamCtx);
}
