"use client";

/**
 * MissionPulse — Card mission live pour le bandeau "En cours" du cockpit.
 *
 * Affiche statut + nom + temps écoulé depuis runningSince (ou lastRunAt
 * si pas live). Click → ouvre MissionStage via stage store.
 */

import { useStageStore } from "@/stores/stage";
import { RelativeTime } from "../RelativeTime";

export interface MissionPulseProps {
  id: string;
  name: string;
  status: "idle" | "running" | "success" | "failed" | "blocked";
  runningSince: number | null;
  lastRunAt: number | null;
  lastError: string | null;
}

const STATUS_LABEL: Record<MissionPulseProps["status"], string> = {
  idle: "en attente",
  running: "en cours",
  success: "ok",
  failed: "erreur",
  blocked: "bloquée",
};

function statusColor(status: MissionPulseProps["status"]): string {
  switch (status) {
    case "running":
      return "var(--cykan)";
    case "success":
      return "var(--text-muted)";
    case "failed":
    case "blocked":
      return "var(--text-faint)";
    default:
      return "var(--text-ghost)";
  }
}

export function MissionPulse(props: MissionPulseProps) {
  const setStageMode = useStageStore((s) => s.setMode);
  const isLive = props.status === "running";
  const ts = props.runningSince ?? props.lastRunAt;

  return (
    <button
      type="button"
      onClick={() => setStageMode({ mode: "mission", missionId: props.id })}
      className="card-depth flex flex-col text-left w-full"
      style={{
        padding: "var(--space-5)",
        gap: "var(--space-3)",
        cursor: "pointer",
      }}
      data-mission-id={props.id}
      data-mission-status={props.status}
    >
      <div className="flex items-center justify-between" style={{ gap: "var(--space-3)" }}>
        <div className="flex items-center min-w-0" style={{ gap: "var(--space-3)" }}>
          <span
            className={`rounded-pill shrink-0 ${isLive ? "animate-pulse" : ""}`}
            style={{
              width: "var(--space-2)",
              height: "var(--space-2)",
              background: statusColor(props.status),
            }}
            aria-hidden
          />
          <span
            className="t-9 font-mono uppercase"
            style={{
              letterSpacing: "var(--tracking-marquee)",
              color: statusColor(props.status),
            }}
          >
            {STATUS_LABEL[props.status]}
          </span>
        </div>
        {ts && (
          <span
            className="t-9 font-mono"
            style={{
              letterSpacing: "var(--tracking-display)",
              color: "var(--text-faint)",
            }}
          >
            <RelativeTime ts={ts} />
          </span>
        )}
      </div>

      <p
        className="t-15 truncate"
        style={{
          fontWeight: 500,
          color: "var(--text-l0)",
        }}
      >
        {props.name}
      </p>

      {props.lastError && !isLive && (
        <p
          className="t-11 truncate"
          style={{
            color: "var(--text-faint)",
            fontFamily: "var(--font-mono)",
          }}
          title={props.lastError}
        >
          {props.lastError}
        </p>
      )}
    </button>
  );
}
