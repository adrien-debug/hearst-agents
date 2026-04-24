"use client";

import { useState } from "react";
import type { ServiceDefinition } from "@/lib/integrations/types";
import { AppCard } from "./AppCard";

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

  // Determine which services are missing (not connected)
  const missingServices = requiredServices.filter(
    (req) => !connectedServices.some((conn) => conn.id === req.id)
  );

  // If all required services are connected, don't show
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
      <div className="flex items-center justify-between px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
        <span className="text-xs text-amber-400">
          ⚠️ Connexion {label} requise
        </span>
        <button
          onClick={() => setIsExpanded(true)}
          className="text-xs text-amber-400/60 hover:text-amber-400"
        >
          Développer
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-amber-500/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400 text-lg">
            ⚠️
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">
              Capacité {label} non disponible
            </h3>
            <p className="text-xs text-white/50 mt-0.5">
              Connectez une application pour utiliser cette fonctionnalité
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setIsExpanded(false);
            onDismiss?.();
          }}
          className="text-white/30 hover:text-white/60 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Draft restoration warning (for write operations) */}
      {draftMessage && onRestoreDraft && (
        <div className="px-4 py-3 bg-white/[0.02] border-b border-amber-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">Brouillon en attente:</span>
              <span className="text-xs text-white/60 truncate max-w-[200px]">{draftMessage}</span>
            </div>
            <button
              onClick={() => onRestoreDraft(draftMessage)}
              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              Restaurer →
            </button>
          </div>
        </div>
      )}

      {/* Recommended services */}
      <div className="p-4">
        <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">
          Applications recommandées
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {missingServices.slice(0, 2).map((service) => (
            <div
              key={service.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:border-amber-500/20 transition-colors"
            >
              <span className="text-2xl">{service.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{service.name}</p>
                <p className="text-xs text-white/40 truncate">{service.description}</p>
              </div>
              <button
                onClick={() => handleConnect(service.id)}
                disabled={connectingId === service.id}
                className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                {connectingId === service.id ? "..." : "Connecter"}
              </button>
            </div>
          ))}
        </div>

        {/* Link to App Hub */}
        <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
          <p className="text-xs text-white/40">
            {missingServices.length} application{missingServices.length > 1 ? "s" : ""} possible
            {missingServices.length > 1 ? "s" : ""}
          </p>
          <button className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
            Voir toutes les apps →
          </button>
        </div>
      </div>

      {/* Security note for write operations */}
      {draftMessage && (
        <div className="px-4 py-2 bg-amber-500/5 border-t border-amber-500/10">
          <p className="text-[10px] text-white/30">
            💡 Pour votre sécurité, les actions à effet de bord (envoi, création, suppression)
            ne seront pas relancées automatiquement après connexion. Votre brouillon sera restauré
            pour confirmation.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Inline variant for chat messages ──────────────────────

interface InlineCapabilityBlockProps {
  capability: string;
  onConnect: () => void;
}

export function InlineCapabilityBlock({ capability, onConnect }: InlineCapabilityBlockProps) {
  const capabilityLabels: Record<string, string> = {
    messaging: "messagerie",
    calendar: "agenda",
    files: "fichiers",
    crm: "CRM",
    support: "support",
    finance: "finance",
    developer_tools: "outils dev",
    design: "design",
  };

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full">
      <span className="text-xs text-amber-400">
        {capabilityLabels[capability] || capability} requis
      </span>
      <button
        onClick={onConnect}
        className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
      >
        Connecter
      </button>
    </div>
  );
}
