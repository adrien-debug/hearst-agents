"use client";

import { useState } from "react";

export default function CalendarPage() {
  const [view, setView] = useState<"day" | "week" | "month">("week");

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg)" }}>
      <div className="border-b border-[var(--line)] p-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="ghost-meta-label mb-2">VIEW_STUB</p>
            <h1 className="ghost-title-impact text-lg">Agenda</h1>
            <p className="text-[11px] font-light text-[var(--text-muted)] mt-2">Calendriers agrégés.</p>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-faint)] border-b border-[var(--line-strong)] pb-1">ROADMAP</span>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-2">
          {[
            { id: "day", label: "Jour" },
            { id: "week", label: "Semaine" },
            { id: "month", label: "Mois" },
          ].map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id as typeof view)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                view === v.id
                  ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                  : "bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.05]"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center gap-4">
        <p className="ghost-meta-label">NO_DATA</p>
        <h2 className="ghost-title-impact text-sm">CAL_UNIFIED</h2>
        <p className="text-[12px] font-light text-[var(--text-muted)] max-w-md">Timeline multi-calendriers — phase build.</p>
        <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--text-faint)] border-b border-[var(--money)] pb-0.5">GCAL_ON</span>
      </div>
    </div>
  );
}
