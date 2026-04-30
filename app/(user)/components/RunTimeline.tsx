"use client";

import type { TimelineItem, TimelineSeverity } from "@/lib/engine/runtime/timeline/types";

interface RunTimelineProps {
  timeline: TimelineItem[];
  isLive?: boolean;
}

const SEVERITY_STYLES: Record<TimelineSeverity, string> = {
  info: "text-[var(--text-muted)]",
  success: "text-[var(--money)]",
  warning: "text-[var(--warn)]",
  error: "text-[var(--danger)]",
};

const SEVERITY_REF: Record<TimelineSeverity, string> = {
  info: "INF",
  success: "OK",
  warning: "WRN",
  error: "ERR",
};

const TYPE_REF: Record<string, string> = {
  run_started: "EVT_RUN_START",
  run_completed: "EVT_RUN_OK",
  run_failed: "EVT_RUN_FAIL",
  execution_mode: "EVT_MODE",
  agent_selected: "EVT_AGENT",
  provider_check: "EVT_PROVIDER",
  capability_blocked: "EVT_CAP_BLOCK",
  step_started: "EVT_STEP_RUN",
  step_completed: "EVT_STEP_OK",
  step_failed: "EVT_STEP_FAIL",
  asset_generated: "EVT_ASSET",
  log: "EVT_LOG",
};

export function RunTimeline({ timeline, isLive }: RunTimelineProps) {
  if (timeline.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-[var(--text-muted)] t-13 font-light">
        {isLive ? "STREAM_WAIT" : "NO_EVENTS"}
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--line)]">
      {timeline.map((item, index) => {
        const typeRef = TYPE_REF[item.type] || `EVT_${item.type.toUpperCase()}`;
        const sevRef = SEVERITY_REF[item.severity];
        const isLast = index === timeline.length - 1;
        const severityClass = SEVERITY_STYLES[item.severity];

        return (
          <div key={item.id} className={`flex items-start gap-4 py-3 px-2 ${isLast && isLive ? "bg-[var(--bg-soft)]" : ""}`}>
            <span className={`font-mono t-8 uppercase tracking-wide shrink-0 pt-0.5 border-b pb-0.5 ${severityClass} border-current`}>
              {sevRef}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-mono t-9 uppercase tracking-snug text-[var(--text-faint)] mb-1">{typeRef}</p>
              <p className={`t-13 font-light leading-snug ${severityClass}`}>{item.title}</p>
              {item.description && (
                <p className="t-11 text-[var(--text-muted)] truncate mt-1">{item.description}</p>
              )}
              {item.backend && (
                <p className="t-10 font-mono text-[var(--text-faint)] mt-1">BACKEND_{item.backend}</p>
              )}
              {item.provider && (
                <p className="t-10 font-mono text-[var(--text-faint)]">PROVIDER_{item.provider}</p>
              )}
              {item.assetName && (
                <p className="t-10 font-mono text-[var(--money)] mt-1">ASSET_{item.assetName}</p>
              )}
            </div>
            {isLast && isLive && <span className="w-1.5 h-1.5 shrink-0 mt-1 bg-[var(--cykan)] animate-pulse" />}
          </div>
        );
      })}
    </div>
  );
}
