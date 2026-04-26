"use client";

import type { ServiceWithConnectionStatus, ServiceDefinition } from "@/lib/integrations/types";
import { ConnectionStatusChip } from "./ConnectionStatusChip";
import { GhostIconLayers, GhostIconPlus, ServiceIdGlyph } from "./ghost-icons";

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
        className={`flex w-full items-center gap-3 p-3 text-left transition-colors border-b border-[var(--line)] ${
          isConnected ? "hover:bg-[var(--bg-soft)]" : "hover:bg-[var(--bg-elev)]"
        }`}
      >
        <ServiceIdGlyph id={service.id} icon={service.icon} size="sm" />
        <div className="flex-1 min-w-0">
          <p className={`t-13 font-medium tracking-tight truncate ${isConnected ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
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
        className="flex w-full flex-col p-6 text-left transition-colors border-b border-[var(--line)] bg-[var(--bg)] hover:bg-[var(--bg-soft)]"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex -space-x-1">
            {(service as ServiceDefinition).popularUseCases?.slice(0, 4).map((_, i) => (
              <div
                key={i}
                className="w-8 h-8 flex items-center justify-center border border-[var(--line-strong)] bg-[var(--bg-elev)] text-[var(--text-muted)]"
                style={{ zIndex: 4 - i }}
              >
                {i === 3 ? <GhostIconPlus className="w-3.5 h-3.5" /> : <GhostIconLayers className="w-3.5 h-3.5" />}
              </div>
            ))}
          </div>
          <span className="font-mono t-9 uppercase tracking-[0.2em] text-[var(--text-faint)] border-b border-[var(--warn)] pb-0.5">
            BND_{(service as ServiceDefinition).popularUseCases?.length || 0}
          </span>
        </div>
        <h3 className="t-13 font-black uppercase tracking-tighter text-[var(--text)] mb-1">{service.name}</h3>
        <p className="t-11 font-light leading-relaxed text-[var(--text-muted)] line-clamp-2">{service.description}</p>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`group flex w-full flex-col p-5 text-left transition-colors border-b border-[var(--line)] bg-[var(--bg)] ${
        isConnected ? "hover:bg-[var(--bg-soft)]" : "hover:bg-[var(--bg-elev)]"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <ServiceIdGlyph id={service.id} icon={service.icon} />
        <ConnectionStatusChip status={status} type={service.type} compact />
      </div>

      <h3 className={`t-13 font-black uppercase tracking-tighter mb-1 ${isConnected ? "text-[var(--text)]" : "text-[var(--text-soft)]"}`}>
        {service.name}
      </h3>
      <p className="t-11 font-light leading-relaxed text-[var(--text-muted)] line-clamp-2 mb-3">{service.description}</p>

      {service.tier === "tier_1" && (
        <div className="flex flex-wrap gap-2 mt-auto">
          {service.popularUseCases?.slice(0, 2).map((useCase) => (
            <span
              key={useCase}
              className="t-9 font-mono uppercase tracking-[0.12em] text-[var(--text-faint)] border-b border-[var(--line-strong)] pb-0.5 truncate max-w-full"
            >
              UC_{useCase.slice(0, 24)}
            </span>
          ))}
        </div>
      )}

      {isConnected ? (
        <div className="mt-4 pt-4 border-t border-[var(--line)] flex items-center justify-between font-mono t-9 uppercase tracking-[0.16em]">
          <span className="text-[var(--money)] border-b border-[var(--money)] pb-0.5">STATUS_READY</span>
          <span className="text-[var(--text-faint)] group-hover:text-[var(--cykan)]">OPEN_R</span>
        </div>
      ) : (
        <div className="mt-4 pt-4 border-t border-[var(--line)] flex items-center justify-between font-mono t-9 uppercase tracking-[0.16em]">
          <span className="text-[var(--text-faint)]">STATUS_OFF</span>
          <span className="text-[var(--cykan)] border-b border-[var(--cykan)] pb-0.5">LINK_R</span>
        </div>
      )}
    </button>
  );
}
