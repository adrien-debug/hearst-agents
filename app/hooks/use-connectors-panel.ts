"use client";

import { useEffect, useRef, useState } from "react";

export interface PanelConnection {
  provider: string;
  label: string;
  status: string;
  capabilities: string[];
  canConnect: boolean;
  authConnected: boolean;
  controlPlaneConnected: boolean;
  lastCheckedAt?: number;
  lastError?: string;
  isDiverged: boolean;
  reconciliationNote?: string;
  source: { auth: string; controlPlane: string };
}

export interface PanelHealth {
  healthy: number;
  degraded: number;
  disconnected: number;
}

interface ConnectorsPanelState {
  loading: boolean;
  error: boolean;
  connections: PanelConnection[];
  health: PanelHealth | null;
}

export function useConnectorsPanel(): ConnectorsPanelState {
  const [state, setState] = useState<ConnectorsPanelState>({
    loading: true,
    error: false,
    connections: [],
    health: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    abortRef.current = ac;

    async function load() {
      try {
        const res = await fetch("/api/v2/connectors/unified", { signal: ac.signal });

        if (!res.ok) {
          setState({ loading: false, error: true, connections: [], health: null });
          return;
        }

        const data = await res.json();
        if (ac.signal.aborted) return;

        const connections: PanelConnection[] = (data.connections ?? []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (c: any) => ({
            provider: c.provider,
            label: c.label ?? c.provider,
            status: c.status,
            capabilities: c.capabilities ?? [],
            canConnect: c.canConnect ?? false,
            authConnected: c.authConnected ?? false,
            controlPlaneConnected: c.controlPlaneConnected ?? false,
            lastCheckedAt: c.lastCheckedAt,
            lastError: c.lastError,
            isDiverged: c.isDiverged ?? false,
            reconciliationNote: c.reconciliationNote,
            source: c.source ?? { auth: "missing", controlPlane: "missing" },
          }),
        );

        const health: PanelHealth = {
          healthy: connections.filter((c) => c.status === "connected").length,
          degraded: connections.filter((c) => c.status === "degraded").length,
          disconnected: connections.filter(
            (c) => c.status === "disconnected" || c.status === "pending_auth",
          ).length,
        };

        setState({ loading: false, error: false, connections, health });
      } catch {
        if (!ac.signal.aborted) {
          setState({ loading: false, error: true, connections: [], health: null });
        }
      }
    }

    load();
    const interval = setInterval(load, 30_000);

    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    return () => {
      ac.abort();
      abortRef.current = null;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return state;
}
