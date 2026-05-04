"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRuntimeStore } from "@/stores/runtime";
import type { CockpitTodayPayload } from "@/lib/cockpit/today";

interface ActivityStripProps {
  data: CockpitTodayPayload;
}

const IDLE_HIDE_MS = 5 * 60_000;

function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  if (diff < 1_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1_000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

const SSE_TYPE_FR: Record<string, string> = {
  step_started: "Step started",
  step_completed: "Step completed",
  run_started: "Run started",
  run_completed: "Run completed",
  run_failed: "Run failed",
  text_delta: "Text generated",
  asset_generated: "Asset generated",
  focal_object_ready: "Asset ready",
  approval_requested: "Approval required",
  clarification_requested: "Clarification required",
  plan_preview: "Plan ready",
  plan_step_started: "Plan step started",
  plan_step_completed: "Plan step completed",
};

function prettifyType(type: string): string {
  return SSE_TYPE_FR[type] ?? type.replace(/_/g, " ");
}

export function ActivityStrip({ data }: ActivityStripProps) {
  const coreState = useRuntimeStore((s) => s.coreState);
  const events = useRuntimeStore((s) => s.events);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const isLive = coreState === "streaming" || coreState === "processing" || coreState === "connecting";
  const runningCount = data.missionsRunning.filter((m) => m.status === "running").length;

  const lastEvent = useMemo(() => {
    if (!events || events.length === 0) return null;
    return events[events.length - 1];
  }, [events]);

  // Fallback en idle : dernier `lastRunAt` parmi missionsRunning
  const lastMissionRun = useMemo(() => {
    let best: { name: string; ts: number; status: string } | null = null;
    for (const m of data.missionsRunning) {
      if (typeof m.lastRunAt !== "number") continue;
      if (!best || m.lastRunAt > best.ts) {
        best = { name: m.name, ts: m.lastRunAt, status: m.status };
      }
    }
    return best;
  }, [data.missionsRunning]);

  const lastTs = lastEvent?.timestamp ?? lastMissionRun?.ts ?? data.generatedAt;
  const idleSince = now - lastTs;
  const isHidden =
    !isLive && runningCount === 0 && !lastEvent && !lastMissionRun && idleSince > IDLE_HIDE_MS;

  if (isHidden) {
    return (
      <div
        className="flex items-center shrink-0"
        style={{
          height: "var(--space-10)",
          padding: "0 var(--space-3)",
          borderBottom: "1px solid var(--border-soft)",
        }}
      >
        <span className="t-11 font-light text-[var(--text-faint)]">System idle</span>
      </div>
    );
  }

  // Calcul du label ticker, par priorité décroissante :
  // 1. Event SSE en cours (label fourni ou type FR)
  // 2. Dernière mission terminée (avec statut)
  // 3. Briefing du jour (si récent)
  // 4. Fallback "Aucune activité récente"
  const tickerLabel = (() => {
    if (lastEvent) {
      const label = lastEvent["label"];
      if (typeof label === "string" && label.length > 0) return label;
      return prettifyType(lastEvent.type);
    }
    if (lastMissionRun) {
      const verb =
        lastMissionRun.status === "success"
          ? "Mission succeeded"
          : lastMissionRun.status === "failed"
            ? "Mission failed"
            : "Last mission";
      return `${verb}: ${lastMissionRun.name}`;
    }
    if (data.briefing && !data.briefing.empty && data.briefing.generatedAt) {
      return "Daily briefing available";
    }
    return "No recent activity";
  })();

  return (
    <div
      className="flex items-center gap-3 shrink-0"
      style={{
        height: "var(--space-10)",
        padding: "0 var(--space-3)",
      }}
    >
      {/* Gauche : count + dots */}
      <div className="flex items-center gap-2 shrink-0">
        {isLive && (
          <span className="flex items-center gap-1" aria-hidden>
            <span className="context-tile-status is-running" />
            <span className="context-tile-status is-running" style={{ animationDelay: "0.2s" }} />
            <span className="context-tile-status is-running" style={{ animationDelay: "0.4s" }} />
          </span>
        )}
        <span className="t-11 font-medium text-[var(--text-l1)] tabular-nums">
          {runningCount} running
        </span>
      </div>

      {/* Centre : ticker */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="t-11 font-mono tabular-nums text-[var(--text-faint)] shrink-0">
          {formatTs(lastTs)}
        </span>
        <span className="t-11 text-[var(--text-faint)]">·</span>
        <span className="t-11 font-light text-[var(--text-soft)] truncate">{tickerLabel}</span>
      </div>

      {/* Droite : last activity + log link */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="t-11 font-light text-[var(--text-faint)]">
          {relativeTime(lastTs, now)}
        </span>
        <Link
          href="/runs"
          className="t-11 font-medium text-[var(--cykan)] hover:opacity-80 transition-opacity"
        >
          View logs →
        </Link>
      </div>
    </div>
  );
}
