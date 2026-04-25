"use client";

import type { TimelineItem, TimelineSeverity } from "@/lib/engine/runtime/timeline/types";

interface RunTimelineProps {
  timeline: TimelineItem[];
  isLive?: boolean;
}

const SEVERITY_STYLES: Record<TimelineSeverity, string> = {
  info: "text-white/60",
  success: "text-emerald-400",
  warning: "text-amber-400",
  error: "text-red-400",
};

const SEVERITY_ICONS: Record<TimelineSeverity, string> = {
  info: "•",
  success: "✓",
  warning: "⚠",
  error: "✗",
};

const TYPE_ICONS: Record<string, string> = {
  run_started: "▶️",
  run_completed: "✅",
  run_failed: "❌",
  execution_mode: "⚙️",
  agent_selected: "🤖",
  provider_check: "🔌",
  capability_blocked: "🚫",
  step_started: "🔄",
  step_completed: "✓",
  step_failed: "✗",
  asset_generated: "📄",
  log: "📋",
};

export function RunTimeline({ timeline, isLive }: RunTimelineProps) {
  if (timeline.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-white/40 text-sm">
        {isLive ? "En attente d'événements..." : "Aucun événement"}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {timeline.map((item, index) => {
        const icon = TYPE_ICONS[item.type] || SEVERITY_ICONS[item.severity];
        const isLast = index === timeline.length - 1;
        const severityClass = SEVERITY_STYLES[item.severity];

        return (
          <div
            key={item.id}
            className={`flex items-start gap-3 py-2 px-3 rounded-lg ${
              isLast && isLive ? "bg-cyan-500/5" : ""
            }`}
          >
            <span className="text-sm mt-0.5">{icon}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${severityClass}`}>{item.title}</p>
              {item.description && (
                <p className="text-xs text-white/40 truncate">{item.description}</p>
              )}
              {item.backend && (
                <p className="text-xs text-white/30">Backend: {item.backend}</p>
              )}
              {item.provider && (
                <p className="text-xs text-white/30">Provider: {item.provider}</p>
              )}
              {item.assetName && (
                <p className="text-xs text-emerald-400/60">Asset: {item.assetName}</p>
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
