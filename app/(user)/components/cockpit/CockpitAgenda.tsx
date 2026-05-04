"use client";

import { SectionHeader } from "../ui/SectionHeader";
import { EmptyState } from "../ui/EmptyState";
import type { CockpitTodayPayload } from "@/lib/cockpit/today";

interface CockpitAgendaProps {
  data: CockpitTodayPayload;
}

const MAX_ITEMS = 4;

function formatHHMM(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function CockpitAgenda({ data }: CockpitAgendaProps) {
  const items = data.agenda.slice(0, MAX_ITEMS);
  const hasItems = items.length > 0;

  return (
    <section className="flex flex-col min-h-0 min-w-0" aria-label="Today's agenda">
      <SectionHeader label="Today" />
      {hasItems ? (
        <ul className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ gap: "var(--space-1)" }}>
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-baseline gap-2"
              style={{
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--radius-xs)",
              }}
            >
              <span className="t-11 font-mono tabular-nums text-[var(--cykan)] shrink-0">
                {formatHHMM(item.startsAt)}
              </span>
              <span className="t-11 text-[var(--text-faint)]">·</span>
              <span className="t-13 font-light text-[var(--text-soft)] truncate">
                {item.title}
              </span>
              {item.source === "mock" && (
                <span className="t-9 font-mono text-[var(--text-faint)] shrink-0 ml-auto">
                  demo
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          density="compact"
          title="No events"
          description="Connect your calendar to see your day."
          cta={{ label: "Connect Calendar →", href: "/apps#calendar" }}
        />
      )}
    </section>
  );
}
