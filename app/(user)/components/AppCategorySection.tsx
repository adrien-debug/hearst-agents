"use client";

import type { ServiceDefinition, ServiceWithConnectionStatus } from "@/lib/integrations/types";
import { AppCard } from "./AppCard";

interface AppCategorySectionProps {
  title: string;
  services: ServiceWithConnectionStatus[];
  onServiceClick?: (service: ServiceDefinition) => void;
}

export function AppCategorySection({
  title,
  services,
  onServiceClick,
}: AppCategorySectionProps) {
  if (services.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="t-11 font-mono font-bold uppercase tracking-[0.2em] text-white/40 px-2">
        {title}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {services.map((service) => (
          <AppCard
            key={service.id}
            service={service}
            onClick={() => onServiceClick?.(service)}
          />
        ))}
      </div>
    </div>
  );
}
