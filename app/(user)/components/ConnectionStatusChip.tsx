"use client";

import type { ServiceWithConnectionStatus } from "@/lib/integrations/types";

interface ConnectionStatusChipProps {
  status: ServiceWithConnectionStatus["connectionStatus"];
  type?: "native" | "hybrid" | "nango";
  compact?: boolean;
}

const STATUS_CONFIG = {
  connected: {
    label: "Connecté",
    compactLabel: "●",
    bg: "bg-emerald-500/15",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
  },
  pending: {
    label: "En cours",
    compactLabel: "◐",
    bg: "bg-amber-500/15",
    text: "text-amber-400",
    border: "border-amber-500/30",
  },
  error: {
    label: "Erreur",
    compactLabel: "✕",
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/30",
  },
  disconnected: {
    label: "Déconnecté",
    compactLabel: "○",
    bg: "bg-white/5",
    text: "text-white/40",
    border: "border-white/10",
  },
};

const TYPE_LABELS = {
  native: "Native",
  hybrid: "Hybrid",
  nango: "Nango",
};

export function ConnectionStatusChip({ status, type, compact }: ConnectionStatusChipProps) {
  const config = STATUS_CONFIG[status];

  if (compact) {
    return (
      <span
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-medium ${config.bg} ${config.text}`}
        title={config.label}
      >
        {config.compactLabel}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${config.bg} ${config.text} ${config.border}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        {config.label}
      </span>
      {type && (
        <span className="text-[10px] text-white/30 uppercase tracking-wide">
          {TYPE_LABELS[type]}
        </span>
      )}
    </div>
  );
}
