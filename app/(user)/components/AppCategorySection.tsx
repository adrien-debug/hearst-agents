"use client";

import type { ServiceDefinition, ServiceWithConnectionStatus } from "@/lib/integrations/types";
import { AppCard } from "./AppCard";

interface AppCategorySectionProps {
  title: string;
  services: (ServiceDefinition | ServiceWithConnectionStatus)[];
  icon?: string;
  onServiceClick?: (service: ServiceDefinition | ServiceWithConnectionStatus) => void;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

const CATEGORY_ICONS: Record<string, string> = {
  communication: "💬",
  productivity: "✅",
  storage: "📦",
  project: "📊",
  crm: "🤝",
  dev: "💻",
  design: "🎨",
  finance: "💰",
  support: "🎧",
  analytics: "📈",
  automation: "⚡",
  commerce: "🛍️",
  other: "🧩",
};

export function AppCategorySection({
  title,
  services,
  icon,
  onServiceClick,
}: AppCategorySectionProps) {
  if (services.length === 0) return null;

  const sectionIcon = icon || CATEGORY_ICONS[title.toLowerCase()] || "◈";

  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-lg">{sectionIcon}</span>
        <h2 className="text-sm font-medium text-white/80 uppercase tracking-wider">
          {title}
        </h2>
        <span className="text-xs text-white/30 bg-white/[0.05] px-2 py-0.5 rounded-full">
          {services.length}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {services.map((service) => (
          <AppCard
            key={service.id}
            service={service}
            onClick={() => onServiceClick?.(service)}
          />
        ))}
      </div>
    </section>
  );
}
