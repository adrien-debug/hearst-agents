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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const relevantCapability = SURFACE_CAPABILITIES[surface] || "general";
  const relevantServices = connectedServices.filter((s) =>
    s.capabilities.some((c) => c === relevantCapability || c === "messaging" || c === "calendar" || c === "files")
  );

  const getDisplayText = () => {
    if (selection.mode === "auto") {
      if (relevantServices.length === 0) return "AUTO_NONE";
      const names = relevantServices.slice(0, 2).map((s) => s.name);
      return `AUTO_${names.join("_").toUpperCase()}${relevantServices.length > 2 ? "..." : ""}`;
    }
    if (selection.mode === "pinned") {
      if (selection.services.length === 0) return "PIN_NONE";
      if (selection.services.length === 1) {
        const service = availableServices.find((s) => s.id === selection.services[0]);
        return `PIN_${(service?.name || selection.services[0]).toUpperCase()}`;
      }
      return `PIN_${selection.services.length}_NODES`;
    }
    if (selection.mode === "multi") {
      if (selection.services.length === 0) return "MULTI_NONE";
      return `MULTI_${selection.services.length}_NODES`;
    }
    return "AUTO";
  };

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
          className="flex items-center gap-4 text-[11px] font-mono font-black tracking-[0.4em] text-white/30 hover:text-[var(--cykan)] transition-all duration-500 uppercase"
        >
          <span className="w-2 h-2 rounded-full bg-[var(--cykan)] shadow-[0_0_12px_var(--cykan)]" />
          <span>{getDisplayText()}</span>
        </button>

        {isOpen && (
          <div className="absolute bottom-full left-0 mb-6 w-96 bg-black/95 backdrop-blur-3xl border border-white/10 rounded-[8px] shadow-[0_40px_100px_rgba(0,0,0,0.9)] z-50 overflow-hidden">
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
        className="flex items-center gap-6 text-[11px] font-mono font-black tracking-[0.4em] text-white/30 hover:text-[var(--cykan)] transition-all duration-500 uppercase"
      >
        <span className="text-white/10 uppercase">Sources:</span>
        <span>{getDisplayText()}</span>
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-6 w-96 bg-black/95 backdrop-blur-3xl border border-white/10 rounded-[8px] shadow-[0_40px_100px_rgba(0,0,0,0.9)] z-50 overflow-hidden">
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
    <div className="p-6">
      <div className="flex items-center gap-6 mb-6 border-b border-white/10 pb-6">
        <button
          onClick={() => setActiveTab("mode")}
          className={`text-[11px] font-mono font-black uppercase tracking-[0.3em] transition-colors ${
            activeTab === "mode" ? "text-[var(--cykan)]" : "text-white/30 hover:text-white"
          }`}
        >
          _Mode
        </button>
        <button
          onClick={() => setActiveTab("services")}
          className={`text-[11px] font-mono font-black uppercase tracking-[0.3em] transition-colors ${
            activeTab === "services" ? "text-[var(--cykan)]" : "text-white/30 hover:text-white"
          }`}
        >
          _Sources
        </button>
      </div>

      {activeTab === "mode" && (
        <div className="space-y-2">
          <ModeOption
            id="auto"
            label="Auto"
            description="Automatic node selection"
            selected={mode === "auto"}
            onClick={() => onModeChange("auto")}
          />
          <ModeOption
            id="pinned"
            label="Pinned"
            description="Fixed nodes for this session"
            selected={mode === "pinned"}
            onClick={() => onModeChange("pinned")}
          />
          <ModeOption
            id="multi"
            label="Multi"
            description="Manual multi-node selection"
            selected={mode === "multi"}
            onClick={() => onModeChange("multi")}
          />
        </div>
      )}

      {activeTab === "services" && (
        <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-hide">
          {services.length === 0 ? (
            <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-white/20 text-center py-16">
              No_Connected_Sources
            </p>
          ) : (
            services.map((service) => {
              const isSelected = selectedServices.includes(service.id);
              return (
                <button
                  key={service.id}
                  onClick={() => onToggleService(service)}
                  className={`w-full flex items-center gap-6 px-6 py-5 rounded-[4px] text-left transition-all duration-300 ${
                    isSelected
                      ? "bg-white/10"
                      : "hover:bg-white/5"
                  }`}
                >
                  <span className="text-2xl grayscale">{service.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[15px] font-black uppercase tracking-tighter ${isSelected ? "text-white" : "text-white/50"}`}>
                      {service.name}
                    </p>
                    <p className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-40 truncate">{service.description}</p>
                  </div>
                  {isSelected && <span className="text-[var(--cykan)] text-[11px] font-mono font-black tracking-widest">LINKED_</span>}
                </button>
              );
            })
          )}
        </div>
      )}

      <div className="mt-6 pt-6 border-t border-white/10 flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/20">
          {services.length}_Available
        </span>
        <button
          onClick={onClose}
          className="text-[11px] font-mono font-black uppercase tracking-[0.4em] text-white/30 hover:text-white transition-colors"
        >
          Close_
        </button>
      </div>
    </div>
  );
}

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
      className={`w-full flex items-center gap-6 px-6 py-6 rounded-[4px] text-left transition-all duration-300 ${
        selected ? "bg-white/10" : "hover:bg-white/5"
      }`}
    >
      <div
        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
          selected ? "border-[var(--cykan)]" : "border-white/20"
        }`}
      >
        {selected && <div className="w-2 h-2 rounded-full bg-[var(--cykan)] shadow-[0_0_10px_var(--cykan)]" />}
      </div>
      <div className="flex-1">
        <p className={`text-[16px] font-black uppercase tracking-tighter ${selected ? "text-white" : "text-white/50"}`}>{label}</p>
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-40">{description}</p>
      </div>
    </button>
  );
}

export function getDefaultSelection(services: ServiceDefinition[]): SourceSelection {
  return {
    mode: "auto",
    providers: services.map((s) => getProviderIdForService(s.id) || s.providerId),
    services: services.map((s) => s.id),
  };
}

export type { SourceSelection, SelectionMode };
