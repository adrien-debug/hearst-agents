"use client";

/**
 * MissionsList — rend la liste verticale des missions via MissionRow.
 * Empty state graphique (ring 48×48 ghost + label + lien création).
 */

import { useRouter } from "next/navigation";
import type { RightPanelData } from "@/lib/core/types";
import { MissionRow } from "./MissionRow";

interface MissionsListProps {
  missions: RightPanelData["missions"];
  activeThreadId: string | null;
  loading: boolean;
}

export function MissionsList({ missions, activeThreadId, loading }: MissionsListProps) {
  const router = useRouter();

  if (loading && missions.length === 0) {
    return (
      <div className="px-4 py-8 t-9 font-mono uppercase tracking-[0.22em] text-[var(--text-ghost)] text-center">
        Chargement…
      </div>
    );
  }

  if (missions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-10 gap-4">
        <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden>
          <circle cx="24" cy="24" r="20" fill="none" stroke="var(--border-default)" strokeWidth="1.5" />
          <circle cx="24" cy="24" r="3" fill="var(--text-ghost)" />
        </svg>
        <p className="t-11 text-[var(--text-faint)] text-center">
          Aucune mission armée.
        </p>
        <button
          type="button"
          onClick={() => router.push("/missions?new=1")}
          className="halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-9 font-mono uppercase tracking-[0.22em] border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all"
        >
          <span>Nouvelle mission</span>
          <span aria-hidden>+</span>
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 flex flex-col gap-1.5">
      {missions.map((m) => (
        <MissionRow key={m.id} mission={m} activeThreadId={activeThreadId} />
      ))}
    </div>
  );
}
