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

// Static tabs — only General, as other capabilities have dedicated pages
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

  // Determine which dynamic tabs should be visible based on connected services
  const visibleDynamicTabs = useMemo(() => {
    return DYNAMIC_TABS.filter((tab) => {
      // Check if any connected service has this capability
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

  // Combine static + visible dynamic tabs
  const allTabs = useMemo(() => {
    return [...STATIC_TABS, ...visibleDynamicTabs];
  }, [visibleDynamicTabs]);

  // Show first 4 tabs + "More" button if needed
  const displayedTabs = compact && !showMore ? allTabs.slice(0, 4) : allTabs;
  const hasMore = allTabs.length > 4;

  const handleTabClick = (tab: CapabilityTab) => {
    onModeChange(tab.id);

    // Navigate if surface is different and it's a static tab
    if (tab.surface !== surface && STATIC_TABS.some((t) => t.id === tab.id)) {
      onNavigate(tab.surface);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <div className="flex items-center bg-white/[0.03] border border-white/[0.06] rounded-lg p-1">
          {displayedTabs.map((tab) => {
            const isActive = activeMode === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab)}
                title={tab.description}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? "bg-cyan-500/15 text-cyan-400"
                    : "text-white/50 hover:text-white/70 hover:bg-white/[0.03]"
                }`}
              >
                <span className="text-xs">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {hasMore && !showMore && (
          <button
            onClick={() => setShowMore(true)}
            className="px-2 py-1.5 text-xs text-white/40 hover:text-white/60 transition-colors"
            title="Plus de modes"
          >
            +{allTabs.length - 4}
          </button>
        )}

        {showMore && (
          <div className="absolute top-full left-0 mt-1 bg-[#141414] border border-white/[0.08] rounded-xl shadow-2xl z-50 p-2 min-w-[200px]">
            {allTabs.slice(4).map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  handleTabClick(tab);
                  setShowMore(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  activeMode === tab.id ? "bg-cyan-500/10 text-cyan-400" : "hover:bg-white/[0.03] text-white/70"
                }`}
              >
                <span>{tab.icon}</span>
                <div>
                  <p className="text-sm">{tab.label}</p>
                  <p className="text-[10px] text-white/40">{tab.description}</p>
                </div>
              </button>
            ))}
            <button
              onClick={() => setShowMore(false)}
              className="w-full text-center text-xs text-white/40 hover:text-white/60 py-2 border-t border-white/[0.06] mt-1"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    );
  }

  // Full-size version for dedicated settings/pages
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-white/40 uppercase tracking-wider">
        Mode de conversation
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {allTabs.map((tab) => {
          const isActive = activeMode === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              className={`flex flex-col items-start gap-1 p-3 rounded-xl border transition-all text-left ${
                isActive
                  ? "bg-cyan-500/10 border-cyan-500/30"
                  : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.03]"
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <p className={`text-sm font-medium ${isActive ? "text-white" : "text-white/70"}`}>
                {tab.label}
              </p>
              <p className="text-[10px] text-white/40 line-clamp-2">{tab.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Helper to get capability from surface ─────────────────

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

// ── Helper to check if capability is available ───────────────

export function isCapabilityAvailable(
  mode: CapabilityMode,
  connectedServices: ServiceDefinition[]
): boolean {
  if (["general", "messaging", "calendar", "files"].includes(mode)) {
    return true; // Static modes always available
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
