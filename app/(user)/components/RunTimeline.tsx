"use client";

import type { RunEvent } from "@/lib/events/types";

interface RunTimelineProps {
  events: RunEvent[];
  isLive?: boolean;
}

const EVENT_ICONS: Record<string, string> = {
  run_started: "▶️",
  run_completed: "✅",
  run_failed: "❌",
  text_delta: "📝",
  tool_call_started: "🔧",
  tool_call_completed: "✓",
  tool_call_failed: "✗",
  orchestrator_log: "📋",
  approval_requested: "⏸️",
  approval_decided: "▶️",
};

const EVENT_LABELS: Record<string, string> = {
  run_started: "Run démarré",
  run_completed: "Run terminé",
  run_failed: "Run échoué",
  text_delta: "Réponse",
  tool_call_started: "Appel outil",
  tool_call_completed: "Outil terminé",
  tool_call_failed: "Outil échoué",
  orchestrator_log: "Log",
  approval_requested: "Approbation requise",
  approval_decided: "Décision prise",
};

export function RunTimeline({ events, isLive }: RunTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-white/40 text-sm">
        {isLive ? "En attente d'événements..." : "Aucun événement"}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {events.map((event, index) => {
        const icon = EVENT_ICONS[event.type] || "•";
        const label = EVENT_LABELS[event.type] || event.type;
        const isLast = index === events.length - 1;

        return (
          <div
            key={`${event.type}-${index}`}
            className={`flex items-start gap-3 py-2 px-3 rounded-lg ${
              isLast && isLive ? "bg-cyan-500/5" : ""
            }`}
          >
            <span className="text-sm mt-0.5">{icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/80">{label}</p>
              {"message" in event && event.message && (
                <p className="text-xs text-white/40 truncate">{event.message}</p>
              )}
              {"tool" in event && event.tool && (
                <p className="text-xs text-white/40">{event.tool}</p>
              )}
              {"delta" in event && event.delta && (
                <p className="text-xs text-white/40 truncate">{event.delta.slice(0, 50)}...</p>
              )}
            </div>
            {isLast && isLive && (
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            )}
          </div>
        );
      })}
    </div>
  );
}
