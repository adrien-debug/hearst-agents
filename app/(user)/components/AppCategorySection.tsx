"use client";

import type { ServiceDefinition, ServiceWithConnectionStatus } from "@/lib/integrations/types";
import { AppCard } from "./AppCard";
import { CategoryRailIcon } from "./ghost-icons";

interface AppCategorySectionProps {
  title: string;
  /** Category id for Ghost icon (e.g. communication, crm). */
  categoryId: string;
  services: (ServiceDefinition | ServiceWithConnectionStatus)[];
  onServiceClick?: (service: ServiceDefinition | ServiceWithConnectionStatus) => void;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export function AppCategorySection({
  title,
  categoryId,
  services,
  onServiceClick,
}: AppCategorySectionProps) {
  if (services.length === 0) return null;

  return (
    <section className="mb-12">
      <div className="flex items-center gap-4 mb-6 border-b border-[var(--line)] pb-4">
        <CategoryRailIcon categoryId={categoryId} className="shrink-0" />
        <h2 className="text-[11px] font-mono uppercase tracking-[0.35em] text-[var(--text-muted)]">{title}</h2>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-faint)] border-b border-[var(--line-strong)] pb-0.5">
          COUNT_{services.length}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px bg-[var(--line)]">
        {services.map((service) => (
          <div key={service.id} className="bg-[var(--bg)] min-h-0">
            <AppCard service={service} onClick={() => onServiceClick?.(service)} />
          </div>
        ))}
      </div>
    </section>
  );
}
