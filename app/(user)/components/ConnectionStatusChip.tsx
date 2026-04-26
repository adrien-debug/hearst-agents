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
    compactLabel: "ON",
    line: "border-[var(--money)]",
    text: "text-[var(--money)]",
    dot: "bg-[var(--money)]",
  },
  pending: {
    label: "En cours",
    compactLabel: "WT",
    line: "border-[var(--warn)]",
    text: "text-[var(--warn)]",
    dot: "bg-[var(--warn)]",
  },
  error: {
    label: "Erreur",
    compactLabel: "ERR",
    line: "border-[var(--danger)]",
    text: "text-[var(--danger)]",
    dot: "bg-[var(--danger)]",
  },
  disconnected: {
    label: "Déconnecté",
    compactLabel: "OFF",
    line: "border-[var(--line-strong)]",
    text: "text-[var(--text-muted)]",
    dot: "bg-[var(--text-muted)]",
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
        className={`inline-flex items-center justify-center min-w-[1.75rem] px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] border-b ${config.line} ${config.text}`}
        title={config.label}
      >
        {config.compactLabel}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-2 px-0 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] border-b ${config.line} ${config.text}`}
      >
        <span className={`w-1 h-1 shrink-0 ${config.dot}`} />
        STATUS_{config.compactLabel}
      </span>
      {type && (
        <span className="text-[9px] font-mono text-[var(--text-faint)] uppercase tracking-[0.2em]">{TYPE_LABELS[type]}</span>
      )}
    </div>
  );
}
