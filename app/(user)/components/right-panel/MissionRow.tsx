"use client";

/**
 * MissionRow — une mission rendue avec :
 *   - Ring SVG 32×32 (running animé / armed plein 35% / failed danger / off ghost)
 *   - Nom mission + schedule label humanisé
 *   - Badge état mono + meta lastRunAt relatif
 *
 * Click → setFocal(missionToFocal(mission)).
 */

import type { RightPanelData } from "@/lib/core/types";
import { useFocalStore } from "@/stores/focal";
import { missionToFocal } from "@/lib/ui/focal-mappers";
import { formatRelativeTime } from "../right-panel-helpers";

interface MissionRowProps {
  mission: RightPanelData["missions"][number];
  activeThreadId: string | null;
}

const STATE_LABEL: Record<string, string> = {
  running: "running",
  failed: "échec",
  blocked: "bloqué",
  success: "ok",
  idle: "idle",
};

function humanSchedule(schedule: string | undefined): string {
  if (!schedule) return "";
  const s = schedule.toLowerCase().trim();
  if (s === "daily" || s === "@daily") return "Tous les jours";
  if (s === "weekly" || s === "@weekly") return "Toutes les semaines";
  if (s === "hourly" || s === "@hourly") return "Toutes les heures";
  if (s === "monthly" || s === "@monthly") return "Tous les mois";
  // Cron à 5 champs : laisse tel quel, l'utilisateur reconnaîtra son pattern
  return schedule;
}

export function MissionRow({ mission, activeThreadId }: MissionRowProps) {
  const isRunning = mission.opsStatus === "running";
  const isFailed = mission.opsStatus === "failed";
  const isArmed = mission.enabled && !isRunning && !isFailed;
  const isOff = !mission.enabled && !isFailed;

  const stateLabel = isRunning
    ? STATE_LABEL.running
    : isFailed
      ? STATE_LABEL.failed
      : isArmed
        ? "armé"
        : "off";

  const stateColor = isRunning
    ? "var(--cykan)"
    : isFailed
      ? "var(--danger)"
      : isArmed
        ? "var(--cykan)"
        : "var(--text-faint)";

  return (
    <button
      type="button"
      onClick={() => useFocalStore.getState().setFocal(missionToFocal(mission, activeThreadId))}
      className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-sm hover:bg-[var(--surface-2)] transition-colors"
      style={{ background: "var(--surface-1)" }}
    >
      {/* Ring SVG 32×32 */}
      <svg width="32" height="32" viewBox="0 0 32 32" className="shrink-0" aria-hidden>
        {/* Base circle (always visible) */}
        <circle cx="16" cy="16" r="13" fill="none" stroke="var(--border-default)" strokeWidth="1.5" />

        {isRunning && (
          <>
            <circle
              cx="16" cy="16" r="13"
              fill="none"
              stroke="var(--cykan)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="55 82"
              transform="rotate(-90 16 16)"
              style={{ filter: "drop-shadow(0 0 4px var(--cykan))" }}
            />
            <circle cx="16" cy="16" r="3.5" fill="var(--cykan)" />
          </>
        )}

        {isArmed && (
          <circle
            cx="16" cy="16" r="13"
            fill="none"
            stroke="var(--cykan)"
            strokeWidth="1.5"
            opacity="0.35"
            transform="rotate(-90 16 16)"
          />
        )}

        {isFailed && (
          <>
            <circle
              cx="16" cy="16" r="13"
              fill="none"
              stroke="var(--danger)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="20 82"
              transform="rotate(-90 16 16)"
            />
            <circle cx="16" cy="16" r="3" fill="var(--danger)" />
          </>
        )}

        {isOff && (
          <circle cx="16" cy="16" r="3" fill="var(--text-ghost)" />
        )}
      </svg>

      <span className="flex-1 min-w-0 flex flex-col">
        <span className="t-13 font-medium text-[var(--text-soft)] truncate">{mission.name}</span>
        <span className="t-9 font-mono uppercase tracking-label text-[var(--text-ghost)] mt-0.5 truncate">
          {humanSchedule(mission.schedule)}
        </span>
      </span>

      <span className="shrink-0 flex flex-col items-end gap-0.5">
        <span
          className="t-9 font-mono uppercase tracking-stretch"
          style={{ color: stateColor }}
        >
          {stateLabel}
        </span>
        {mission.lastRunAt && (
          <span className="t-9 font-mono text-[var(--text-faint)]">
            {formatRelativeTime(mission.lastRunAt)}
          </span>
        )}
      </span>
    </button>
  );
}
