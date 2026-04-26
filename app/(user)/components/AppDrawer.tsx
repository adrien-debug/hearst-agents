"use client";

import { useState } from "react";
import type { ServiceWithConnectionStatus, ServiceDefinition } from "@/lib/integrations/types";
import { ConnectionStatusChip } from "./ConnectionStatusChip";
import { getProviderIdForService } from "@/lib/integrations/service-map";
import { GhostIconChevronRight, GhostIconX, ServiceIdGlyph } from "./ghost-icons";

interface AppDrawerProps {
  service: ServiceWithConnectionStatus | ServiceDefinition | null;
  isOpen: boolean;
  onClose: () => void;
  onConnect?: (serviceId: string) => void;
  isConnecting?: boolean;
}

const TYPE_BADGES = {
  native: { label: "TYPE_NATIVE", line: "border-[var(--cykan)]", text: "text-[var(--cykan)]" },
  hybrid: { label: "TYPE_HYBRID", line: "border-[var(--warn)]", text: "text-[var(--warn)]" },
  nango: { label: "TYPE_NANGO", line: "border-[var(--line-strong)]", text: "text-[var(--text-muted)]" },
};

const TIER_LABELS = {
  tier_1: "TIER_01",
  tier_2: "TIER_02",
  tier_3: "TIER_03",
};

export function AppDrawer({ service, isOpen, onClose, onConnect, isConnecting: externalIsConnecting }: AppDrawerProps) {
  const [internalIsConnecting, setInternalIsConnecting] = useState(false);
  const isConnecting = externalIsConnecting ?? internalIsConnecting;

  if (!isOpen || !service) return null;

  const isConnected = "connectionStatus" in service && service.connectionStatus === "connected";
  const status = "connectionStatus" in service ? service.connectionStatus : "disconnected";
  const typeBadge = TYPE_BADGES[service.type];
  const providerId = getProviderIdForService(service.id);

  const handleConnect = async () => {
    if (!onConnect || isConnecting) return;
    setInternalIsConnecting(true);
    try {
      await onConnect(service.id);
    } finally {
      setInternalIsConnecting(false);
    }
  };

  return (
    <>
      <div className="ghost-overlay-backdrop z-[55]" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full w-[400px] max-w-full ghost-drawer-panel z-[60] flex flex-col border-t-0">
        <div className="flex items-center justify-between p-4 border-t border-[var(--ghost-modal-top)] border-b border-[var(--line)]">
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)] p-1" aria-label="Fermer">
            <GhostIconX className="w-4 h-4" />
          </button>
          <ConnectionStatusChip status={status} type={service.type} />
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-start gap-4 mb-8">
            <ServiceIdGlyph id={service.id} icon={service.icon} size="lg" />
            <div className="min-w-0">
              <h2 className="text-base font-bold tracking-tight text-white">{service.name}</h2>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <span className={`font-mono t-9 uppercase tracking-[0.2em] border-b pb-0.5 ${typeBadge.line} ${typeBadge.text}`}>
                  {typeBadge.label}
                </span>
                <span className="font-mono t-9 uppercase tracking-[0.2em] text-[var(--text-faint)]">{TIER_LABELS[service.tier]}</span>
              </div>
            </div>
          </div>

          <p className="t-13 font-light leading-relaxed text-[var(--text-soft)] mb-8">{service.description}</p>

          {service.popularUseCases && service.popularUseCases.length > 0 && (
            <div className="mb-8">
              <h3 className="ghost-meta-label mb-4">USE_CASE_REF</h3>
              <div className="space-y-0 divide-y divide-[var(--line)]">
                {service.popularUseCases.map((useCase) => (
                  <div key={useCase} className="flex items-center gap-3 py-3">
                    <GhostIconChevronRight className="w-3.5 h-3.5 shrink-0 text-[var(--cykan)]" />
                    <span className="text-xs font-light text-[var(--text-soft)]">{useCase}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-8">
            <h3 className="ghost-meta-label mb-4">CAPABILITIES</h3>
            <div className="flex flex-wrap gap-2">
              {service.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="font-mono t-9 uppercase tracking-[0.12em] text-[var(--text-muted)] border-b border-[var(--line-strong)] pb-0.5"
                >
                  {cap.replace(/_/g, "_")}
                </span>
              ))}
            </div>
          </div>

          {providerId && providerId !== service.id && (
            <div className="mb-6 pb-4 border-b border-[var(--line)]">
              <p className="ghost-meta-label mb-2">PROVIDER_REF</p>
              <p className="text-xs font-mono text-[var(--text-soft)] uppercase tracking-tight">{providerId}</p>
            </div>
          )}

          {isConnected && "accountLabel" in service && service.accountLabel && (
            <div className="mb-6 pb-4 border-b border-[var(--money)]">
              <p className="ghost-meta-label mb-2 text-[var(--money)]">ACCOUNT_LINK</p>
              <p className="text-xs font-light text-[var(--text)]">{service.accountLabel}</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[var(--line)] space-y-2">
          {isConnected ? (
            <>
              <button
                type="button"
                className="ghost-btn-solid ghost-btn-cykan w-full rounded-sm"
              >
                OPEN_{service.id.toUpperCase().slice(0, 8)}
              </button>
              <button
                type="button"
                className="ghost-btn-solid ghost-btn-ghost w-full rounded-sm"
              >
                MGMT_CONN
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleConnect}
                disabled={isConnecting}
                className="ghost-btn-solid ghost-btn-cykan w-full rounded-sm disabled:opacity-40"
              >
                {isConnecting ? "AUTH_PENDING" : `LINK_${service.id.toUpperCase().slice(0, 8)}`}
              </button>
              <button type="button" onClick={onClose} className="ghost-btn-solid ghost-btn-ghost w-full rounded-sm">
                DISMISS
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
