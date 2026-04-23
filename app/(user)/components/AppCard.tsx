"use client";

import type { ServiceWithConnectionStatus, ServiceDefinition } from "@/lib/integrations/types";
import { ConnectionStatusChip } from "./ConnectionStatusChip";

interface AppCardProps {
  service: ServiceWithConnectionStatus | ServiceDefinition;
  onClick?: () => void;
  variant?: "default" | "compact" | "bundle";
}

export function AppCard({ service, onClick, variant = "default" }: AppCardProps) {
  const isConnected = "connectionStatus" in service && service.connectionStatus === "connected";
  const status = "connectionStatus" in service ? service.connectionStatus : "disconnected";

  if (variant === "compact") {
    return (
      <button
        onClick={onClick}
        className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${
          isConnected
            ? "bg-white/[0.03] border-white/[0.08] hover:border-cyan-500/30"
            : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.03]"
        }`}
      >
        <span className="text-xl">{service.icon}</span>
        <div className="flex-1 min-w-0 text-left">
          <p className={`text-sm font-medium truncate ${isConnected ? "text-white" : "text-white/70"}`}>
            {service.name}
          </p>
        </div>
        <ConnectionStatusChip status={status} compact />
      </button>
    );
  }

  if (variant === "bundle") {
    return (
      <button
        onClick={onClick}
        className="flex flex-col p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03] hover:border-cyan-500/20 transition-all text-left"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex -space-x-2">
            {(service as ServiceDefinition).popularUseCases?.slice(0, 4).map((_, i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-white/[0.08] flex items-center justify-center text-sm"
                style={{ zIndex: 4 - i }}
              >
                {i === 3 ? "+" : "◈"}
              </div>
            ))}
          </div>
          <span className="text-xs text-white/40 bg-white/[0.05] px-2 py-0.5 rounded-full">
            {(service as ServiceDefinition).popularUseCases?.length || 0} apps
          </span>
        </div>
        <h3 className="text-sm font-medium text-white mb-1">{service.name}</h3>
        <p className="text-xs text-white/40 line-clamp-2">{service.description}</p>
      </button>
    );
  }

  // Default variant
  return (
    <button
      onClick={onClick}
      className={`flex flex-col p-4 rounded-xl border transition-all text-left group ${
        isConnected
          ? "bg-white/[0.03] border-white/[0.08] hover:border-cyan-500/30"
          : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.03]"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-2xl">{service.icon}</span>
        <ConnectionStatusChip status={status} type={service.type} compact />
      </div>

      <h3 className={`text-sm font-medium mb-1 ${isConnected ? "text-white" : "text-white/80"}`}>
        {service.name}
      </h3>
      <p className="text-xs text-white/40 line-clamp-2 mb-3">{service.description}</p>

      {service.tier === "tier_1" && (
        <div className="flex flex-wrap gap-1 mt-auto">
          {service.popularUseCases?.slice(0, 2).map((useCase) => (
            <span
              key={useCase}
              className="text-[10px] text-white/30 bg-white/[0.05] px-2 py-0.5 rounded-full"
            >
              {useCase.slice(0, 20)}...
            </span>
          ))}
        </div>
      )}

      {isConnected ? (
        <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between">
          <span className="text-xs text-emerald-400">Prêt à utiliser</span>
          <span className="text-xs text-white/30 group-hover:text-cyan-400 transition-colors">
            Ouvrir →
          </span>
        </div>
      ) : (
        <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between">
          <span className="text-xs text-white/30">Non connecté</span>
          <span className="text-xs text-cyan-400">Connecter →</span>
        </div>
      )}
    </button>
  );
}
