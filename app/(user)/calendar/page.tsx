"use client";

import { useState } from "react";
import { useNavigationStore } from "@/stores/navigation";

export default function CalendarPage() {
  const { surface } = useNavigationStore();
  const [view, setView] = useState<"day" | "week" | "month">("week");

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-white/[0.06] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-medium text-white mb-1">Agenda</h1>
            <p className="text-sm text-white/40">
              Tous vos calendriers en un seul endroit
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/30 bg-white/[0.05] px-3 py-1.5 rounded-full">
              Bientôt disponible
            </span>
          </div>
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
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
          <span className="text-2xl">📅</span>
        </div>
        <h2 className="text-lg font-medium text-white mb-2">
          Agenda unifié
        </h2>
        <p className="text-sm text-white/40 max-w-md mb-6">
          Cette vue agrégera vos événements Google Calendar, Outlook, et autres calendriers en une timeline unique.
        </p>
        <div className="flex items-center gap-3 text-xs text-white/30">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Google Calendar connecté
          </span>
        </div>
      </div>
    </div>
  );
}
