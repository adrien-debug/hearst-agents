"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { getProviderLabel } from "@/lib/providers/registry";

export interface ServiceStatus {
  provider: string;
  connected: boolean;
}

interface UseConnectedServicesResult {
  services: ServiceStatus[];
  loading: boolean;
  connectedProviders: string[];
  isConnected: (provider: string) => boolean;
  refresh: () => void;
}

export function useConnectedServices(): UseConnectedServicesResult {
  const { data: session } = useSession();
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(() => {
    if (!session) {
      setServices([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch("/api/v2/connectors/unified")
      .then((r) => (r.ok ? r.json() : { connections: [] }))
      .then((data) => {
        const connections = data.connections ?? data.connectors ?? [];
        const mapped: ServiceStatus[] = connections.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (c: any) => ({
            provider: c.provider,
            connected: c.status === "connected" || c.authConnected === true,
          }),
        );
        setServices(mapped);
      })
      .catch(() => setServices([]))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      fetchStatus();
    });

    const onFocus = () => fetchStatus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchStatus]);

  const connectedProviders = useMemo(
    () =>
      services
        .filter((s) => s.connected)
        .map((s) => getProviderLabel(s.provider)),
    [services],
  );

  const isConnected = useCallback(
    (provider: string) => services.some((s) => s.provider === provider && s.connected),
    [services],
  );

  return { services, loading, connectedProviders, isConnected, refresh: fetchStatus };
}
