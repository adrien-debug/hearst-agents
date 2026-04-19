"use client";

import Link from "next/link";
import type { RightPanelRun, RightPanelCurrentRun } from "@/lib/ui/right-panel/types";
import type { StreamEvent } from "@/app/lib/run-stream-context";

const STATUS_DOT: Record<string, string> = {
  running: "bg-cyan-400 animate-pulse",
  completed: "bg-emerald-500",
  failed: "bg-red-500",
};

const EVENT_LABEL: Record<string, string> = {
  run_started: "Execution started",
  execution_mode_selected: "Mode selected",
  agent_selected: "Agent assigned",
  step_started: "Step started",
  step_completed: "Step completed",
  tool_call_started: "Tool called",
  tool_call_completed: "Tool done",
  asset_generated: "Asset created",
  run_completed: "Run completed",
  run_failed: "Run failed",
  orchestrator_log: "Log",
  plan_attached: "Plan created",
  tool_surface: "Tools loaded",
  capability_blocked: "Blocked",
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}j`;
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex animate-pulse items-center gap-2 rounded-lg px-2 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-800" />
          <span className="h-3 flex-1 rounded bg-zinc-800/60" />
          <span className="h-3 w-10 rounded bg-zinc-800/40" />
        </div>
      ))}
    </div>
  );
}

function LiveEventRow({ event }: { event: StreamEvent }) {
  if (event.type === "capability_blocked") {
    const providers = (event.requiredProviders as string[]) ?? [];
    const primary = providers[0];
    const deepLink = primary
      ? `/apps?provider=${primary}`
      : `/apps?capability=${event.capability as string}`;

    return (
      <div className="mx-1 my-0.5 flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1.5">
        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-amber-400/90">
            Blocked — {providers.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" / ")} required
          </p>
          <Link
            href={deepLink}
            className="text-[10px] text-cyan-400/70 hover:text-cyan-300"
          >
            Connect →
          </Link>
        </div>
      </div>
    );
  }

  const label = EVENT_LABEL[event.type] ?? event.type;
  const detail =
    event.type === "orchestrator_log"
      ? (event.message as string)
      : event.type === "execution_mode_selected"
        ? (event.mode as string)
        : event.type === "agent_selected"
          ? (event.agent_name as string)
          : null;

  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <span className="h-1 w-1 shrink-0 rounded-full bg-cyan-400" />
      <span className="min-w-0 flex-1 truncate text-[11px] text-cyan-300/80">
        {label}
        {detail && (
          <span className="ml-1 text-zinc-500">— {detail}</span>
        )}
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
    .filter((e) => EVENT_LABEL[e.type])
    .slice(0, 6);

  return (
    <section className="mb-4">
      <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        Execution
      </h3>

      {loading ? (
        <SkeletonRows />
      ) : error ? (
        <p className="px-2 text-xs text-zinc-600">Sign in to activate</p>
      ) : runs.length === 0 && !currentRun && visibleLiveEvents.length === 0 ? (
        <p className="px-2 text-xs text-zinc-600">No activity yet</p>
      ) : (
        <div className="space-y-0.5">
          {currentRun && (
            <div className="flex items-center gap-2 rounded-lg bg-cyan-500/5 px-2 py-2 ring-1 ring-cyan-500/10">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
              <span className="flex-1 truncate text-xs font-medium text-white">
                Running…
              </span>
              {currentRun.executionMode && (
                <span className="text-[10px] text-cyan-400/70">
                  {currentRun.executionMode}
                </span>
              )}
            </div>
          )}

          {visibleLiveEvents.length > 0 && (
            <div className="mb-1 rounded-lg bg-zinc-900/30 py-1">
              {visibleLiveEvents.map((event, i) => (
                <LiveEventRow key={`${event.type}-${event.timestamp}-${i}`} event={event} />
              ))}
            </div>
          )}

          {runs.length > 0 && visibleLiveEvents.length > 0 && (
            <div className="my-1.5 border-t border-zinc-800/40" />
          )}

          {runs.slice(0, 6).map((run) => (
            <button
              key={run.id}
              onClick={() => onRunSelect?.(run)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all duration-150 ${
                selectedRunId === run.id ? "bg-zinc-800/50 ring-1 ring-cyan-500/15" : "hover:bg-zinc-900/30"
              }`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[run.status] ?? "bg-zinc-700"}`} />
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">
                {run.input.length > 40 ? run.input.slice(0, 40) + "…" : run.input}
              </span>
              <span className="shrink-0 text-[10px] text-zinc-700">
                {timeAgo(run.createdAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
