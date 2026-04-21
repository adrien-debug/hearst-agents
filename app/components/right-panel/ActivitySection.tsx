"use client";

import Link from "next/link";
import type { RightPanelRun, RightPanelCurrentRun } from "@/lib/ui/right-panel/types";
import type { StreamEvent } from "@/app/lib/run-stream-context";

const EVENT_LABEL: Record<string, string> = {
  run_started: "init",
  execution_mode_selected: "mode",
  agent_selected: "agent",
  step_started: "step",
  step_completed: "step_ok",
  tool_call_started: "call",
  tool_call_completed: "call_ok",
  asset_generated: "asset",
  run_completed: "done",
  run_failed: "fail",
  orchestrator_log: "log",
  plan_attached: "plan",
  tool_surface: "tools",
  capability_blocked: "blocked",
};

const OPACITY_BY_INDEX = [
  "opacity-100 text-cyan-400",
  "opacity-60 text-white/60",
  "opacity-30 text-white/30",
] as const;

function SkeletonRows() {
  return (
    <div className="flex flex-col-reverse gap-0">
      {[0, 1, 2].map((i) => (
        <div key={i} className={`flex items-start gap-3 py-1 ${OPACITY_BY_INDEX[i]}`}>
          <span className="h-2 w-10 rounded bg-white/10 mt-0.5" />
          <span className="h-2 flex-1 rounded bg-white/5 mt-0.5" />
        </div>
      ))}
    </div>
  );
}

function LiveEventRow({ event, idx }: { event: StreamEvent; idx: number }) {
  const opClass = OPACITY_BY_INDEX[idx] ?? "opacity-30 text-white/30";
  const ts = new Date(event.timestamp).toLocaleTimeString("en-US", {
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  if (event.type === "capability_blocked") {
    const providers = (event.requiredProviders as string[]) ?? [];
    const primary = providers[0];
    const deepLink = primary
      ? `/apps?provider=${primary}`
      : `/apps?capability=${event.capability as string}`;

    return (
      <div className={`flex items-start gap-3 py-1 transition-opacity duration-300 ${idx === 0 ? "opacity-100" : idx === 1 ? "opacity-60" : "opacity-30"}`}>
        <span className="text-[9px] font-mono text-amber-400/60 shrink-0 mt-0.5">{ts}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-mono leading-relaxed text-amber-400/80">
            blocked — {providers.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(", ")}
          </p>
          <Link href={deepLink} className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300">
            Connecter →
          </Link>
        </div>
      </div>
    );
  }

  const label = EVENT_LABEL[event.type] ?? event.type;
  const detail =
    event.type === "orchestrator_log" ? (event.message as string)
      : event.type === "execution_mode_selected" ? (event.mode as string)
      : event.type === "agent_selected" ? (event.agent_name as string)
      : null;

  return (
    <div className={`flex items-start gap-3 py-1 transition-opacity duration-300 ${opClass}`}>
      <span className={`text-[9px] font-mono shrink-0 mt-0.5 ${idx === 0 ? "text-cyan-400/60" : "text-white/20"}`}>{ts}</span>
      <span className="text-[10px] font-mono leading-relaxed">
        {label}
        {detail && <span className="ml-1 text-white/20">— {detail}</span>}
      </span>
    </div>
  );
}

export function ActivitySection({
  currentRun,
  runs,
  liveEvents,
  loading,
  error,
  selectedRunId,
  onRunSelect,
}: {
  currentRun?: RightPanelCurrentRun;
  runs: RightPanelRun[];
  liveEvents: StreamEvent[];
  loading: boolean;
  error: boolean;
  selectedRunId?: string;
  onRunSelect?: (run: RightPanelRun) => void;
}) {
  const visibleLiveEvents = liveEvents
    .filter((e) => EVENT_LABEL[e.type] || e.type === "capability_blocked")
    .slice(0, 3);

  return (
    <section className="relative min-h-[80px] overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-[#080808] to-transparent" />

      {loading ? (
        <SkeletonRows />
      ) : error ? (
        <p className="text-[10px] font-mono text-white/20">Connexion requise</p>
      ) : runs.length === 0 && !currentRun && visibleLiveEvents.length === 0 ? (
        <p className="text-[10px] font-mono text-white/15">Système en veille</p>
      ) : (
        <div className="flex flex-col-reverse gap-0 pt-6">
          {currentRun && (
            <div className="flex items-center gap-3 py-1 opacity-100">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0 mt-0.5 ml-1" />
              <span className="text-[10px] font-mono text-cyan-400 truncate">
                En cours…
              </span>
            </div>
          )}

          {visibleLiveEvents.map((event, i) => (
            <LiveEventRow
              key={`${event.type}-${event.timestamp}-${i}`}
              event={event}
              idx={currentRun ? i + 1 : i}
            />
          ))}

          {!currentRun && visibleLiveEvents.length === 0 && runs.slice(0, 3).map((run, i) => {
            const opClass = i === 0 ? "opacity-100 text-white/90" : i === 1 ? "opacity-60 text-white/60" : "opacity-30 text-white/30";
            const timeClass = i === 0 ? "text-white/60" : "text-white/20";
            return (
            <button
              key={run.id}
              onClick={() => onRunSelect?.(run)}
              className={`flex w-full items-start gap-3 py-1 text-left transition-opacity duration-300 hover:opacity-100 ${selectedRunId === run.id ? "opacity-100 text-white/90" : opClass}`}
            >
              <span className={`text-[9px] font-mono shrink-0 mt-0.5 ${timeClass}`}>
                {new Date(run.createdAt).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className="text-[10px] font-mono truncate flex-1">
                {run.input}
              </span>
            </button>
          )})}
        </div>
      )}
    </section>
  );
}
