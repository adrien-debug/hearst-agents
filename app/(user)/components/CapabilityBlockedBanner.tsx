"use client";

import { useState } from "react";
import type { ServiceDefinition } from "@/lib/integrations/types";
import { GhostIconAlert, GhostIconChevronRight, GhostIconX, ServiceIdGlyph } from "./ghost-icons";

interface CapabilityBlockedBannerProps {
  capability: string;
  requiredServices: ServiceDefinition[];
  connectedServices: ServiceDefinition[];
  onConnect: (serviceId: string) => void;
  onDismiss?: () => void;
  draftMessage?: string;
  onRestoreDraft?: (message: string) => void;
}

export function CapabilityBlockedBanner({
  capability,
  requiredServices,
  connectedServices,
  onConnect,
  onDismiss,
  draftMessage,
  onRestoreDraft,
}: CapabilityBlockedBannerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const missingServices = requiredServices.filter(
    (req) => !connectedServices.some((conn) => conn.id === req.id)
  );

  if (missingServices.length === 0) return null;

  const capabilityLabels: Record<string, string> = {
    messaging: "messagerie",
    calendar: "agenda",
    files: "fichiers",
    crm: "CRM",
    support: "support client",
    finance: "finance",
    developer_tools: "outils développeur",
    design: "design",
    commerce: "e-commerce",
    automation: "automatisation",
  };

  const label = capabilityLabels[capability] || capability;

  const handleConnect = async (serviceId: string) => {
    setConnectingId(serviceId);
    try {
      await onConnect(serviceId);
    } finally {
      setConnectingId(null);
    }
  };

  if (!isExpanded) {
    return (
      <div className="flex items-center justify-between px-4 py-3 border-t border-b border-[var(--warn)] bg-[var(--bg-soft)]">
        <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[var(--warn)] flex items-center gap-2">
          <GhostIconAlert className="w-3.5 h-3.5 shrink-0" />
          CAP_BLOCK: {label}
        </span>
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          Expand
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--warn)] bg-[var(--bg)]">
      <div className="flex items-start justify-between p-4 border-b border-[var(--line)]">
        <div className="flex items-start gap-3 min-w-0">
          <GhostIconAlert className="w-5 h-5 shrink-0 text-[var(--warn)] mt-0.5" />
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-[var(--warn)] mb-1">Capability Locked</p>
            <h3 className="text-[13px] font-black uppercase tracking-tighter text-[var(--text)]">Refus: {label}</h3>
            <p className="text-[11px] font-light text-[var(--text-muted)] mt-1">Connecter une source pour déverrouiller.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsExpanded(false);
            onDismiss?.();
          }}
          className="text-[var(--text-muted)] hover:text-[var(--text)] p-1 shrink-0"
          aria-label="Réduire"
        >
          <GhostIconX className="w-4 h-4" />
        </button>
      </div>

      {draftMessage && onRestoreDraft && (
        <div className="px-4 py-3 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="text-[9px] font-mono uppercase tracking-[0.1em] text-white/30">Draft</span>
            <p className="text-[11px] font-mono text-[var(--text-muted)] truncate mt-1">{draftMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => onRestoreDraft(draftMessage)}
            className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--cykan)] border-b border-[var(--cykan)] pb-0.5 flex items-center gap-1 shrink-0"
          >
            Restore <GhostIconChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="p-4">
        <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/30 mb-4">Source Recognition</p>
        <div className="divide-y divide-[var(--line)]">
          {missingServices.slice(0, 2).map((service) => (
            <div key={service.id} className="flex flex-wrap items-center gap-4 py-4 first:pt-0">
              <ServiceIdGlyph id={service.id} icon={service.icon} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-[var(--text)] truncate">{service.name}</p>
                <p className="text-[10px] font-mono text-[var(--text-muted)] truncate">{service.description}</p>
              </div>
              <button
                type="button"
                onClick={() => handleConnect(service.id)}
                disabled={connectingId === service.id}
                className="ghost-btn-solid ghost-btn-cykan rounded-sm text-[9px] disabled:opacity-40"
              >
                {connectingId === service.id ? "AUTH…" : "LINK"}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-[var(--line)] flex items-center justify-between">
          <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-[var(--text-faint)]">
            POOL_{missingServices.length}_SVC
          </p>
          <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-[var(--cykan)] border-b border-[var(--cykan)] pb-0.5">
            Hub_Apps
          </span>
        </div>
      </div>

      {draftMessage && (
        <div className="px-4 py-3 border-t border-[var(--line)] bg-[var(--bg-soft)]">
          <p className="text-[10px] font-mono text-[var(--text-muted)] leading-relaxed">
            SEC_NOTE: actions à effet de bord ne sont pas relancées après connexion. Brouillon restauré pour confirmation.
          </p>
        </div>
      )}
    </div>
  );
}

interface InlineCapabilityBlockProps {
  capability: string;
  onConnect: () => void;
}

export function InlineCapabilityBlock({ capability, onConnect }: InlineCapabilityBlockProps) {
  return (
    <div className="my-3 p-3 border-l-2 border-[var(--warn)] bg-[var(--bg-soft)]">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--warn)] mb-2">CAP_{capability}</p>
      <button type="button" onClick={onConnect} className="ghost-btn-solid ghost-btn-cykan rounded-sm text-[9px]">
        Connect_Source
      </button>
    </div>
  );
}
