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
  icon: React.ReactNode;
  surface: Surface;
  description: string;
}

const GeneralIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>;

const STATIC_TABS: CapabilityTab[] = [
  {
    id: "general",
    label: "Général",
    icon: <GeneralIcon />,
    surface: "home",
    description: "Discussion générale avec toutes les capacités",
  },
];

const CRMIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const SupportIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="11" r="1" fill="currentColor"/></svg>;
const FinanceIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
const DevIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
const DesignIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>;

const DYNAMIC_TABS: CapabilityTab[] = [
  {
    id: "crm",
    label: "CRM",
    icon: <CRMIcon />,
    surface: "home",
    description: "HubSpot, Salesforce, contacts",
  },
  {
    id: "support",
    label: "Support",
    icon: <SupportIcon />,
    surface: "home",
    description: "Zendesk, Intercom, tickets",
  },
  {
    id: "finance",
    label: "Finance",
    icon: <FinanceIcon />,
    surface: "home",
    description: "Stripe, QuickBooks, revenus",
  },
  {
    id: "developer",
    label: "Dev",
    icon: <DevIcon />,
    surface: "home",
    description: "GitHub, Jira, Linear",
  },
  {
    id: "design",
    label: "Design",
    icon: <DesignIcon />,
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
                className={`t-11 font-mono font-black uppercase tracking-[0.4em] transition-all duration-500 flex items-center gap-4 relative group ${
                  isActive
                    ? "text-[var(--cykan)]"
                    : "text-white/30 hover:text-white"
                }`}
              >
                <span className="text-lg grayscale group-hover:grayscale-0 transition-all">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {isActive && (
                  <span className="absolute -bottom-3 left-0 right-0 h-[2px] bg-[var(--cykan)]" />
                )}
              </button>
            );
          })}
        </div>

        {hasMore && !showMore && (
          <button
            onClick={() => setShowMore(true)}
            className="t-11 font-mono font-black tracking-[0.3em] text-white/20 hover:text-white transition-colors"
          >
            +{allTabs.length - 4}
          </button>
        )}

        {showMore && (
          <div className="absolute top-full left-0 mt-6 bg-black border border-white/10 rounded-[8px] z-50 p-4 min-w-[280px]">
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
                  <p className="t-15 font-black uppercase tracking-tighter">{tab.label}</p>
                  <p className="t-10 font-mono uppercase tracking-[0.2em] opacity-40">{tab.description}</p>
                </div>
              </button>
            ))}
            <button
              onClick={() => setShowMore(false)}
              className="w-full text-center t-11 font-mono font-black uppercase tracking-[0.5em] text-white/20 hover:text-white py-6 border-t border-white/10 mt-4"
            >
              Close_Menu
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 bg-gradient-to-b from-white/[0.02] to-transparent p-8 rounded-lg border border-white/[0.05]">
      <p className="t-11 font-mono font-bold text-white/30 uppercase tracking-[0.3em]">
        Capability Mode
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {allTabs.map((tab) => {
          const isActive = activeMode === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              className={`flex flex-col items-start gap-4 p-6 rounded-sm border transition-all text-left ${
                isActive
                  ? "bg-gradient-to-br from-white/[0.06] to-white/[0.02] border-[var(--cykan)]/50 text-[var(--cykan)] shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
                  : "bg-gradient-to-br from-white/[0.03] to-transparent border-white/10 hover:bg-white/[0.04] hover:border-white/20"
              }`}
            >
              <span className="text-2xl grayscale group-hover:grayscale-0">{tab.icon}</span>
              <div>
                <p className={`text-base font-bold tracking-tight ${isActive ? "text-white" : "text-white/60"}`}>
                  {tab.label}
                </p>
                <p className="t-10 font-mono tracking-wide text-white/30 line-clamp-2 mt-1">{tab.description}</p>
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
