"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";

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

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  slack: "Slack",
};

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
    fetch("/api/connectors/status")
      .then((r) => (r.ok ? r.json() : { connectors: [] }))
      .then((data) => {
        if (Array.isArray(data.connectors)) {
          setServices(data.connectors);
        }
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
        .map((s) => PROVIDER_LABELS[s.provider] ?? s.provider),
    [services],
  );

  const isConnected = useCallback(
    (provider: string) => services.some((s) => s.provider === provider && s.connected),
    [services],
  );

  return { services, loading, connectedProviders, isConnected, refresh: fetchStatus };
}
