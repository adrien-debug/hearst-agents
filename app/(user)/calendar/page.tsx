"use client";

import { useState } from "react";

export default function CalendarPage() {
  const [view, setView] = useState<"day" | "week" | "month">("week");

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-br from-[var(--surface)] via-[var(--bg-soft)] to-[var(--mat-050)]">
      <div className="bg-gradient-to-b from-white/[0.03] to-transparent border-b border-white/[0.06] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="t-10 font-mono uppercase tracking-[0.15em] text-white/30 mb-2">Calendar</p>
            <h1 className="text-xl font-bold tracking-tight text-white">Agenda</h1>
            <p className="text-xs font-normal text-white/50 mt-2">Calendriers agrégés.</p>
          </div>
          <span className="font-mono t-10 tracking-[0.1em] text-white/30 border-b border-white/10 pb-1">Roadmap</span>
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
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                view === v.id
                  ? "bg-gradient-to-r from-[var(--cykan)]/20 to-[var(--cykan)]/5 text-[var(--cykan)] border border-[var(--cykan)]/30"
                  : "bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06]"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center gap-4 bg-gradient-to-b from-transparent to-white/[0.01]">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-white/[0.05] to-transparent flex items-center justify-center mb-2">
          <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="t-10 font-mono uppercase tracking-[0.15em] text-white/30">No data</p>
        <h2 className="text-base font-bold tracking-tight text-white/70">Unified Calendar</h2>
        <p className="t-13 font-normal text-white/50 max-w-md">Timeline multi-calendriers — phase build.</p>
        <span className="px-4 py-1.5 rounded-full bg-white/[0.03] border border-[var(--cykan)]/20 t-10 font-mono tracking-[0.1em] text-[var(--cykan)]/70">Google Calendar</span>
      </div>
    </div>
  );
}
