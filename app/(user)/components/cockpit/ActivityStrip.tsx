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
  if (diff < 1_000) return "à l'instant";
  if (diff < 60_000) return `il y a ${Math.floor(diff / 1_000)}s`;
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)}min`;
  return `il y a ${Math.floor(diff / 3_600_000)}h`;
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
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

  const lastTs = lastEvent?.timestamp ?? data.generatedAt;
  const idleSince = now - lastTs;
  const isHidden = !isLive && runningCount === 0 && idleSince > IDLE_HIDE_MS;

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
        <span className="t-11 font-light text-[var(--text-faint)]">Système en veille</span>
      </div>
    );
  }

  const eventLabel = (() => {
    if (!lastEvent) return null;
    const label = lastEvent["label"];
    if (typeof label === "string") return label;
    return lastEvent.type.replace(/_/g, " ");
  })();
  const tickerLabel =
    eventLabel ??
    (runningCount > 0 ? `${runningCount} mission${runningCount > 1 ? "s" : ""} en cours` : "—");

  return (
    <div
      className="flex items-center gap-3 shrink-0"
      style={{
        height: "var(--space-10)",
        padding: "0 var(--space-3)",
        background: "var(--surface-1)",
        borderBottom: "1px solid var(--border-soft)",
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
          {runningCount} en cours
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
          Voir le journal →
        </Link>
      </div>
    </div>
  );
}
