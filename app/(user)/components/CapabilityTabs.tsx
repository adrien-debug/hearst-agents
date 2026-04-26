"use client";

import { useState, useMemo } from "react";
import { useNavigationStore, type Surface } from "@/stores/navigation";
import type { ServiceDefinition } from "@/lib/integrations/types";

export type CapabilityMode =
  | "general"
  | "messaging"
  | "calendar"
  | "files"
  | "crm"
  | "support"
  | "finance"
  | "developer"
  | "design";

interface CapabilityTab {
  id: CapabilityMode;
  label: string;
  icon: string;
  surface: Surface;
  description: string;
}

const STATIC_TABS: CapabilityTab[] = [
  {
    id: "general",
    label: "Général",
    icon: "◉",
    surface: "home",
    description: "Discussion générale avec toutes les capacités",
  },
];

const DYNAMIC_TABS: CapabilityTab[] = [
  {
    id: "crm",
    label: "CRM",
    icon: "🤝",
    surface: "home",
    description: "HubSpot, Salesforce, contacts",
  },
  {
    id: "support",
    label: "Support",
    icon: "🎧",
    surface: "home",
    description: "Zendesk, Intercom, tickets",
  },
  {
    id: "finance",
    label: "Finance",
    icon: "💰",
    surface: "home",
    description: "Stripe, QuickBooks, revenus",
  },
  {
    id: "developer",
    label: "Dev",
    icon: "💻",
    surface: "home",
    description: "GitHub, Jira, Linear",
  },
  {
    id: "design",
    label: "Design",
    icon: "🎨",
    surface: "home",
    description: "Figma, maquettes, créatifs",
  },
];

interface CapabilityTabsProps {
  connectedServices: ServiceDefinition[];
  activeMode: CapabilityMode;
  onModeChange: (mode: CapabilityMode) => void;
  onNavigate: (surface: Surface) => void;
  compact?: boolean;
}

export function CapabilityTabs({
  connectedServices,
  activeMode,
  onModeChange,
  onNavigate,
  compact = false,
}: CapabilityTabsProps) {
  const [showMore, setShowMore] = useState(false);
  const surface = useNavigationStore((s) => s.surface);

  const visibleDynamicTabs = useMemo(() => {
    return DYNAMIC_TABS.filter((tab) => {
      return connectedServices.some((service) =>
        service.capabilities.some((cap) => {
          if (tab.id === "crm" && cap === "crm") return true;
          if (tab.id === "support" && cap === "support") return true;
          if (tab.id === "finance" && cap === "finance") return true;
          if (tab.id === "developer" && cap === "developer_tools") return true;
          if (tab.id === "design" && cap === "design") return true;
          return false;
        })
      );
    });
  }, [connectedServices]);

  const allTabs = useMemo(() => {
    return [...STATIC_TABS, ...visibleDynamicTabs];
  }, [visibleDynamicTabs]);

  const displayedTabs = compact && !showMore ? allTabs.slice(0, 4) : allTabs;
  const hasMore = allTabs.length > 4;

  const handleTabClick = (tab: CapabilityTab) => {
    onModeChange(tab.id);
    if (tab.surface !== surface && STATIC_TABS.some((t) => t.id === tab.id)) {
      onNavigate(tab.surface);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-10">
        <div className="flex items-center gap-12">
          {displayedTabs.map((tab) => {
            const isActive = activeMode === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab)}
                title={tab.description}
                className={`text-[11px] font-mono font-black uppercase tracking-[0.4em] transition-all duration-500 flex items-center gap-4 relative group ${
                  isActive
                    ? "text-[var(--cykan)]"
                    : "text-white/30 hover:text-white"
                }`}
              >
                <span className="text-lg grayscale group-hover:grayscale-0 transition-all">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {isActive && (
                  <span className="absolute -bottom-3 left-0 right-0 h-[2px] bg-[var(--cykan)] shadow-[0_0_15px_var(--cykan)]" />
                )}
              </button>
            );
          })}
        </div>

        {hasMore && !showMore && (
          <button
            onClick={() => setShowMore(true)}
            className="text-[11px] font-mono font-black tracking-[0.3em] text-white/20 hover:text-white transition-colors"
          >
            +{allTabs.length - 4}
          </button>
        )}

        {showMore && (
          <div className="absolute top-full left-0 mt-6 bg-black/95 backdrop-blur-3xl border border-white/10 rounded-[8px] shadow-[0_40px_100px_rgba(0,0,0,0.9)] z-50 p-4 min-w-[280px]">
            {allTabs.slice(4).map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  handleTabClick(tab);
                  setShowMore(false);
                }}
                className={`w-full flex items-center gap-6 px-6 py-4 rounded-[4px] text-left transition-all duration-300 ${
                  activeMode === tab.id ? "bg-white/10 text-[var(--cykan)]" : "hover:bg-white/5 text-white/50 hover:text-white"
                }`}
              >
                <span className="text-2xl grayscale group-hover:grayscale-0">{tab.icon}</span>
                <div>
                  <p className="text-[15px] font-black uppercase tracking-tighter">{tab.label}</p>
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-40">{tab.description}</p>
                </div>
              </button>
            ))}
            <button
              onClick={() => setShowMore(false)}
              className="w-full text-center text-[11px] font-mono font-black uppercase tracking-[0.5em] text-white/20 hover:text-white py-6 border-t border-white/10 mt-4"
            >
              Close_Menu
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <p className="text-[11px] font-mono font-black text-white/30 uppercase tracking-[0.8em]">
        Capability_Mode
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
        {allTabs.map((tab) => {
          const isActive = activeMode === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              className={`flex flex-col items-start gap-6 p-10 rounded-sm border transition-all text-left ${
                isActive
                  ? "bg-white/[0.04] border-[var(--cykan)]/50 text-[var(--cykan)] shadow-[0_40px_80px_rgba(0,0,0,0.6)]"
                  : "bg-white/[0.02] border-white/10 hover:bg-white/[0.03] hover:border-white/20"
              }`}
            >
              <span className="text-3xl grayscale group-hover:grayscale-0">{tab.icon}</span>
              <div>
                <p className={`text-[18px] font-black uppercase tracking-tighter ${isActive ? "text-white" : "text-white/50"}`}>
                  {tab.label}
                </p>
                <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/30 line-clamp-2 mt-2">{tab.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function getCapabilityFromSurface(surface: Surface): CapabilityMode {
  const mapping: Record<string, CapabilityMode> = {
    home: "general",
    inbox: "messaging",
    calendar: "calendar",
    files: "files",
    tasks: "general",
    apps: "general",
  };
  return mapping[surface] || "general";
}

export function isCapabilityAvailable(
  mode: CapabilityMode,
  connectedServices: ServiceDefinition[]
): boolean {
  if (["general", "messaging", "calendar", "files"].includes(mode)) {
    return true;
  }
  const capabilityMap: Record<string, string> = {
    crm: "crm",
    support: "support",
    finance: "finance",
    developer: "developer_tools",
    design: "design",
  };
  const requiredCap = capabilityMap[mode];
  if (!requiredCap) return false;
  return connectedServices.some((s) => s.capabilities.includes(requiredCap as ServiceDefinition["capabilities"][number]));
}
