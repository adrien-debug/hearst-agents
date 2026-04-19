"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TimelineItem, TimelineSeverity } from "@/lib/runtime/timeline/types";
import { normalizeSingleEvent } from "@/lib/runtime/timeline/normalize";
import { useRunStreamOptional } from "@/app/lib/run-stream-context";

// ── Visual mapping ──────────────────────────────────────────

const SEVERITY_DOT: Record<TimelineSeverity, string> = {
  info: "bg-cyan-400/80",
  success: "bg-emerald-500",
  warning: "bg-amber-400",
  error: "bg-red-500",
};

const SEVERITY_TEXT: Record<TimelineSeverity, string> = {
  info: "text-zinc-400",
  success: "text-emerald-400/90",
  warning: "text-amber-400/90",
  error: "text-red-400/90",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ── Skeleton ────────────────────────────────────────────────

function SkeletonTimeline() {
  return (
    <div className="space-y-2 pt-1">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex animate-pulse items-start gap-2 px-1">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-800" />
          <div className="flex-1 space-y-1">
            <span className="block h-3 w-3/4 rounded bg-zinc-800/60" />
            <span className="block h-2 w-1/2 rounded bg-zinc-800/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Summary header ──────────────────────────────────────────

function RunSummary({ run }: { run: SelectedRun }) {
  const statusColor =
    run.status === "completed"
      ? "text-emerald-400"
      : run.status === "failed"
        ? "text-red-400"
        : run.status === "running"
          ? "text-cyan-400"
          : "text-zinc-500";

  const parts = [
    run.executionMode,
    run.agentId,
    run.backend,
  ].filter(Boolean);

  return (
    <div className="mb-2 rounded-lg bg-zinc-900/50 px-2.5 py-2">
      <p className="truncate text-xs font-medium text-zinc-200">
        {run.input.length > 80 ? run.input.slice(0, 80) + "…" : run.input}
      </p>
      {parts.length > 0 && (
        <p className="mt-0.5 truncate text-[10px] text-zinc-600">
          {parts.join(" · ")}
        </p>
      )}
      <p className={`mt-0.5 text-[10px] font-medium ${statusColor}`}>
        {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
      </p>
    </div>
  );
}

// ── Timeline item ───────────────────────────────────────────

function TimelineRow({
  item,
  onAssetSelect,
}: {
  item: TimelineItem;
  onAssetSelect?: (assetId: string) => void;
}) {
  const isBlockedOrFailed =
    item.type === "capability_blocked" || item.type === "run_failed" || item.type === "step_failed";

  return (
    <div
      className={`flex items-start gap-2 rounded px-1.5 py-1 ${
        isBlockedOrFailed ? "bg-red-500/5" : ""
      }`}
    >
      <span
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[item.severity]}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <p className={`truncate text-[11px] font-medium ${SEVERITY_TEXT[item.severity]}`}>
            {item.title}
          </p>
          <span className="shrink-0 text-[9px] text-zinc-700">{formatTime(item.ts)}</span>
        </div>
        {item.description && (
          <p className="truncate text-[10px] text-zinc-600">
            {item.description.length > 100
              ? item.description.slice(0, 100) + "…"
              : item.description}
          </p>
        )}
        {item.assetName && item.assetId && (
          <button
            onClick={() => onAssetSelect?.(item.assetId!)}
            className="mt-0.5 inline-block rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-400/90 hover:bg-emerald-500/20"
          >
            {item.assetName}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Types ───────────────────────────────────────────────────

export interface SelectedRun {
  id: string;
  input: string;
  status: string;
  executionMode?: string;
  agentId?: string;
  backend?: string;
}

// ── Main component ──────────────────────────────────────────

export function RunTimelineSection({
  selectedRun,
  onDeselect,
  onAssetSelect,
}: {
  selectedRun: SelectedRun | null;
  onDeselect: () => void;
  onAssetSelect?: (assetId: string) => void;
}) {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef<string | null>(null);
  const stream = useRunStreamOptional();

  // Fetch timeline when a run is selected
  useEffect(() => {
    if (!selectedRun) {
      setTimeline([]);
      fetchedRef.current = null;
      return;
    }

    if (fetchedRef.current === selectedRun.id) return;
    fetchedRef.current = selectedRun.id;

    setLoading(true);
    fetch(`/api/v2/runs/${selectedRun.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.timeline) setTimeline(data.timeline);
        else setTimeline([]);
      })
      .catch(() => setTimeline([]))
      .finally(() => setLoading(false));
  }, [selectedRun]);

  // Merge live SSE events for the current run
  useEffect(() => {
    if (!selectedRun || !stream) return;
    if (selectedRun.status !== "running") return;

    const unsub = stream.subscribe((event) => {
      const item = normalizeSingleEvent(selectedRun.id, event);
      if (!item) return;
      setTimeline((prev) => [...prev, item]);
    });

    return unsub;
  }, [selectedRun, stream]);

  const sortedTimeline = useMemo(
    () => [...timeline].sort((a, b) => a.ts - b.ts),
    [timeline],
  );

  if (!selectedRun) {
    return (
      <section className="mb-4">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Timeline
        </h3>
        <p className="px-2 text-xs text-zinc-600">Select a run to inspect</p>
      </section>
    );
  }

  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Timeline
        </h3>
        <button
          onClick={onDeselect}
          className="text-[10px] text-zinc-600 transition-colors hover:text-zinc-400"
        >
          Close
        </button>
      </div>

      <RunSummary run={selectedRun} />

      {loading ? (
        <SkeletonTimeline />
      ) : sortedTimeline.length === 0 ? (
        <p className="px-2 text-xs text-zinc-600">No timeline data for this run</p>
      ) : (
        <div className="space-y-0.5">
          {sortedTimeline.map((item) => (
            <TimelineRow key={item.id} item={item} onAssetSelect={onAssetSelect} />
          ))}
        </div>
      )}
    </section>
  );
}
