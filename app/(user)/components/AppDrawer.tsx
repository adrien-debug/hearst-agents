"use client";

import { useState } from "react";
import type { ServiceWithConnectionStatus, ServiceDefinition } from "@/lib/integrations/types";
import { ConnectionStatusChip } from "./ConnectionStatusChip";
import { getProviderIdForService } from "@/lib/integrations/service-map";

interface AppDrawerProps {
  service: ServiceWithConnectionStatus | ServiceDefinition | null;
  isOpen: boolean;
  onClose: () => void;
  onConnect?: (serviceId: string) => void;
}

const TYPE_BADGES = {
  native: { label: "Native Hearst", bg: "bg-cyan-500/15", text: "text-cyan-400" },
  hybrid: { label: "Hybrid", bg: "bg-purple-500/15", text: "text-purple-400" },
  nango: { label: "Powered by Nango", bg: "bg-white/10", text: "text-white/50" },
};

const TIER_LABELS = {
  tier_1: "Essentiel",
  tier_2: "Recommandé",
  tier_3: "Catalogue",
};

export function AppDrawer({ service, isOpen, onClose, onConnect }: AppDrawerProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  if (!isOpen || !service) return null;

  const isConnected = "connectionStatus" in service && service.connectionStatus === "connected";
  const status = "connectionStatus" in service ? service.connectionStatus : "disconnected";
  const typeBadge = TYPE_BADGES[service.type];
  const providerId = getProviderIdForService(service.id);

  const handleConnect = async () => {
    if (!onConnect || isConnecting) return;
    setIsConnecting(true);
    try {
      await onConnect(service.id);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-[55]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[400px] max-w-full bg-[#0c0c10] border-l border-white/[0.06] z-[60] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors"
          >
            ✕
          </button>
          <ConnectionStatusChip status={status} type={service.type} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Icon & Title */}
          <div className="flex items-center gap-4 mb-6">
            <span className="text-4xl">{service.icon}</span>
            <div>
              <h2 className="text-lg font-medium text-white">{service.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${typeBadge.bg} ${typeBadge.text}`}>
                  {typeBadge.label}
                </span>
                <span className="text-xs text-white/30">{TIER_LABELS[service.tier]}</span>
              </div>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-white/60 leading-relaxed mb-6">
            {service.description}
          </p>

          {/* Use Cases */}
          {service.popularUseCases && service.popularUseCases.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">
                Exemples d&apos;utilisation
              </h3>
              <div className="space-y-2">
                {service.popularUseCases.map((useCase) => (
                  <div
                    key={useCase}
                    className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                  >
                    <span className="text-cyan-400/60">→</span>
                    <span className="text-sm text-white/70">{useCase}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Capabilities */}
          <div className="mb-6">
            <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">
              Capacités
            </h3>
            <div className="flex flex-wrap gap-2">
              {service.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="text-xs bg-white/[0.05] text-white/50 px-3 py-1 rounded-full border border-white/[0.06]"
                >
                  {cap.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>

          {/* Provider Info */}
          {providerId && providerId !== service.id && (
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.06] mb-6">
              <p className="text-xs text-white/40 mb-1">Fourni via</p>
              <p className="text-sm text-white/70 capitalize">{providerId}</p>
            </div>
          )}

          {/* Connection Status Details */}
          {isConnected && "accountLabel" in service && service.accountLabel && (
            <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 mb-6">
              <p className="text-xs text-emerald-400/60 mb-1">Compte connecté</p>
              <p className="text-sm text-white/80">{service.accountLabel}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/[0.06] space-y-3">
          {isConnected ? (
            <>
              <button className="w-full py-2.5 px-4 bg-cyan-500/15 hover:bg-cyan-500/20 text-cyan-400 rounded-lg font-medium transition-colors border border-cyan-500/30">
                Ouvrir {service.name}
              </button>
              <button className="w-full py-2.5 px-4 bg-white/[0.05] hover:bg-white/[0.08] text-white/60 rounded-lg text-sm transition-colors border border-white/[0.08]">
                Gérer la connexion
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="w-full py-2.5 px-4 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConnecting ? "Connexion..." : `Connecter ${service.name}`}
              </button>
              <button
                onClick={onClose}
                className="w-full py-2.5 px-4 bg-transparent hover:bg-white/[0.05] text-white/60 rounded-lg text-sm transition-colors"
              >
                Plus tard
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
