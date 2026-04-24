"use client";

import { useState, useRef, useEffect } from "react";
import { useNavigationStore } from "@/stores/navigation";
import type { ServiceDefinition } from "@/lib/integrations/types";
import { getProviderIdForService } from "@/lib/integrations/service-map";

type SelectionMode = "auto" | "pinned" | "multi";

interface SourceSelection {
  mode: SelectionMode;
  providers: string[]; // Runtime provider IDs
  services: string[];  // UI service IDs
}

interface SourcePickerProps {
  availableServices: ServiceDefinition[];
  connectedServices: ServiceDefinition[];
  currentSurface: string;
  selection: SourceSelection;
  onChange: (selection: SourceSelection) => void;
  compact?: boolean;
}

const SURFACE_CAPABILITIES: Record<string, string> = {
  home: "general",
  inbox: "messaging",
  calendar: "calendar",
  files: "files",
  tasks: "automation",
  apps: "general",
};

export function SourcePicker({
  availableServices,
  connectedServices,
  currentSurface: _currentSurface,
  selection,
  onChange,
  compact = false,
}: SourcePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const surface = useNavigationStore((s) => s.surface);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Get services matching current surface capability
  const relevantCapability = SURFACE_CAPABILITIES[surface] || "general";
  const relevantServices = connectedServices.filter((s) =>
    s.capabilities.some((c) => c === relevantCapability || c === "messaging" || c === "calendar" || c === "files")
  );

  // Format display text
  const getDisplayText = () => {
    if (selection.mode === "auto") {
      if (relevantServices.length === 0) return "Auto (aucune source)";
      const names = relevantServices.slice(0, 2).map((s) => s.name);
      return `Auto (${names.join(" · ")}${relevantServices.length > 2 ? "…" : ""})`;
    }
    if (selection.mode === "pinned") {
      if (selection.services.length === 0) return "Verrouillé (aucun)";
      if (selection.services.length === 1) {
        const service = availableServices.find((s) => s.id === selection.services[0]);
        return `🔒 ${service?.name || selection.services[0]}`;
      }
      return `🔒 ${selection.services.length} sources`;
    }
    if (selection.mode === "multi") {
      if (selection.services.length === 0) return "Multi (aucune)";
      return `☑ ${selection.services.length} sources`;
    }
    return "Auto";
  };

  // Handle mode change
  const handleModeChange = (mode: SelectionMode) => {
    if (mode === "auto") {
      onChange({
        mode: "auto",
        providers: relevantServices.map((s) => getProviderIdForService(s.id) || s.providerId),
        services: relevantServices.map((s) => s.id),
      });
    } else if (mode === "pinned") {
      onChange({
        mode: "pinned",
        providers: selection.services.length > 0 ? selection.providers : [],
        services: selection.services.length > 0 ? selection.services : [],
      });
    }
    setIsOpen(false);
  };

  // Handle service toggle (for multi/pinned)
  const toggleService = (service: ServiceDefinition) => {
    const providerId = getProviderIdForService(service.id) || service.providerId;
    const isSelected = selection.services.includes(service.id);

    if (selection.mode === "multi" || selection.mode === "pinned") {
      if (isSelected) {
        onChange({
          ...selection,
          providers: selection.providers.filter((p) => p !== providerId),
          services: selection.services.filter((s) => s !== service.id),
        });
      } else {
        onChange({
          ...selection,
          providers: [...selection.providers, providerId],
          services: [...selection.services, service.id],
        });
      }
    }
  };

  if (compact) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-full text-xs text-white/60 transition-colors"
        >
          <span>{getDisplayText()}</span>
          <span className="text-white/30">{isOpen ? "▲" : "▼"}</span>
        </button>

        {isOpen && (
          <div className="absolute bottom-full left-0 mb-2 w-72 bg-[#141414] border border-white/[0.08] rounded-xl shadow-2xl z-50 overflow-hidden">
            <SourcePickerContent
              mode={selection.mode}
              onModeChange={handleModeChange}
              services={relevantServices}
              selectedServices={selection.services}
              onToggleService={toggleService}
              onClose={() => setIsOpen(false)}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white/70 transition-colors"
      >
        <span className="text-xs text-white/40">Sources:</span>
        <span>{getDisplayText()}</span>
        <span className="text-white/30 ml-1">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-80 bg-[#141414] border border-white/[0.08] rounded-xl shadow-2xl z-50 overflow-hidden">
          <SourcePickerContent
            mode={selection.mode}
            onModeChange={handleModeChange}
            services={relevantServices}
            selectedServices={selection.services}
            onToggleService={toggleService}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

// ── Sub-component: Dropdown Content ───────────────────────

interface SourcePickerContentProps {
  mode: SelectionMode;
  onModeChange: (mode: SelectionMode) => void;
  services: ServiceDefinition[];
  selectedServices: string[];
  onToggleService: (service: ServiceDefinition) => void;
  onClose: () => void;
}

function SourcePickerContent({
  mode,
  onModeChange,
  services,
  selectedServices,
  onToggleService,
  onClose,
}: SourcePickerContentProps) {
  const [activeTab, setActiveTab] = useState<"mode" | "services">("mode");

  return (
    <div className="p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 border-b border-white/[0.06] pb-2">
        <button
          onClick={() => setActiveTab("mode")}
          className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
            activeTab === "mode" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
          }`}
        >
          Mode
        </button>
        <button
          onClick={() => setActiveTab("services")}
          className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
            activeTab === "services" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
          }`}
        >
          Sources
        </button>
      </div>

      {/* Mode Selection */}
      {activeTab === "mode" && (
        <div className="space-y-1">
          <ModeOption
            id="auto"
            label="Auto"
            description="Le système choisit automatiquement les meilleures sources"
            selected={mode === "auto"}
            onClick={() => onModeChange("auto")}
          />
          <ModeOption
            id="pinned"
            label="Verrouillé"
            description="Sources fixes pour cette conversation"
            selected={mode === "pinned"}
            onClick={() => onModeChange("pinned")}
          />
          <ModeOption
            id="multi"
            label="Multi-sélection"
            description="Choisir plusieurs sources manuellement"
            selected={mode === "multi"}
            onClick={() => onModeChange("multi")}
          />
        </div>
      )}

      {/* Services List */}
      {activeTab === "services" && (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {services.length === 0 ? (
            <p className="text-xs text-white/40 text-center py-4">
              Aucune source connectée pour cette capacité
            </p>
          ) : (
            services.map((service) => {
              const isSelected = selectedServices.includes(service.id);
              return (
                <button
                  key={service.id}
                  onClick={() => onToggleService(service)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    isSelected
                      ? "bg-cyan-500/10 border border-cyan-500/30"
                      : "hover:bg-white/[0.03] border border-transparent"
                  }`}
                >
                  <span className="text-lg">{service.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${isSelected ? "text-white" : "text-white/70"}`}>
                      {service.name}
                    </p>
                    <p className="text-[10px] text-white/40 truncate">{service.description}</p>
                  </div>
                  {isSelected && <span className="text-cyan-400 text-xs">✓</span>}
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-white/[0.06] flex items-center justify-between">
        <span className="text-[10px] text-white/30">
          {services.length} source{services.length !== 1 ? "s" : ""} disponible{services.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={onClose}
          className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}

// ── Sub-component: Mode Option ───────────────────────────

interface ModeOptionProps {
  id: string;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}

function ModeOption({ label, description, selected, onClick }: ModeOptionProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
        selected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
      }`}
    >
      <div
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
          selected ? "border-cyan-400" : "border-white/20"
        }`}
      >
        {selected && <div className="w-2 h-2 rounded-full bg-cyan-400" />}
      </div>
      <div className="flex-1">
        <p className={`text-sm ${selected ? "text-white" : "text-white/70"}`}>{label}</p>
        <p className="text-[10px] text-white/40">{description}</p>
      </div>
    </button>
  );
}

// ── Default selection helper ──────────────────────────────

export function getDefaultSelection(services: ServiceDefinition[]): SourceSelection {
  return {
    mode: "auto",
    providers: services.map((s) => getProviderIdForService(s.id) || s.providerId),
    services: services.map((s) => s.id),
  };
}

export type { SourceSelection, SelectionMode };
