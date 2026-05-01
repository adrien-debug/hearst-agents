"use client";

/**
 * <MissionRow> — rendu d'une rangée mission dans /missions.
 *
 * Extrait depuis missions/page.tsx (524 lignes → 350) pour rendre la page
 * lisible et permettre la mémoisation par mission. Le composant est
 * stateless ; tous les callbacks viennent du parent.
 */

import { GhostIconPencil, GhostIconPlay, GhostIconTrash } from "../ghost-icons";

export type MissionOpsStatus = "idle" | "running" | "success" | "failed" | "blocked";

export interface Mission {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "error";
  lastRun?: string;
  nextRun?: string;
  frequency: string;
  enabled: boolean;
  input?: string;
  opsStatus?: MissionOpsStatus;
  lastError?: string;
  runningSince?: number;
}

interface MissionRowProps {
  mission: Mission;
  currentTime: number;
  onToggle: (mission: Mission) => void;
  onOpen: (mission: Mission) => void;
  onEdit: (mission: Mission) => void;
  onRunNow: (missionId: string) => void;
  onDelete: (mission: Mission) => void;
}

const STATUS_LINE: Record<MissionOpsStatus, string> = {
  running: "border-[var(--cykan)] text-[var(--cykan)]",
  success: "border-[var(--money)] text-[var(--money)]",
  failed: "border-[var(--danger)] text-[var(--danger)]",
  blocked: "border-[var(--warn)] text-[var(--warn)]",
  idle: "border-[var(--line-strong)] text-[var(--text-muted)]",
};

const STATUS_LABEL: Record<MissionOpsStatus, string> = {
  running: "En cours",
  success: "Réussi",
  failed: "Échec",
  blocked: "Bloqué",
  idle: "En pause",
};

export function MissionRow({
  mission,
  currentTime,
  onToggle,
  onOpen,
  onEdit,
  onRunNow,
  onDelete,
}: MissionRowProps) {
  const ops: MissionOpsStatus = mission.opsStatus ?? "idle";

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-6 items-start py-6 border-b border-[var(--border-soft)] px-2 group transition-colors"
    >
      <div className="min-w-0 flex gap-4">
        <button
          type="button"
          onClick={() => onToggle(mission)}
          className={`w-2 h-2 rounded-pill mt-1 shrink-0 transition-colors ${
            mission.enabled ? "bg-[var(--money)]" : "bg-[var(--text-faint)]"
          }`}
          title={mission.enabled ? "Désactiver" : "Activer"}
          aria-label={mission.enabled ? "Désactiver" : "Activer"}
        />
        <button
          type="button"
          onClick={() => onOpen(mission)}
          className="min-w-0 text-left group/open cursor-pointer"
          title={`Open ${mission.name}`}
        >
          <p className="t-9 font-light text-[var(--text-faint)] mb-1">
            Réf {mission.id.slice(0, 8)}
          </p>
          <h3 className="t-13 font-medium text-[var(--text)] tracking-tight group-hover/open:text-[var(--cykan)] transition-colors">
            {mission.name}
          </h3>
          <p className="t-11 font-light leading-relaxed text-[var(--text-muted)] mt-1">
            {mission.description}
          </p>
          {mission.lastError && (
            <p
              className="t-10 font-mono text-[var(--danger)] truncate mt-2 border-b border-[var(--danger)] pb-0.5 inline-block max-w-full"
              title={mission.lastError}
            >
              Erreur : {mission.lastError}
            </p>
          )}
        </button>
      </div>
      <div className="text-right space-y-2">
        <span className={`inline-block t-9 font-medium border-b pb-0.5 ${STATUS_LINE[ops]}`}>
          {STATUS_LABEL[ops]}
        </span>
        <div className="t-10 font-mono tabular-nums text-[var(--text-faint)] space-y-1">
          <div>{mission.frequency}</div>
          {mission.runningSince && (
            <div className="text-[var(--cykan)]">
              {Math.floor((currentTime - mission.runningSince) / 1000)} s
            </div>
          )}
          {mission.nextRun && (
            <div>Prochain {new Date(mission.nextRun).toLocaleDateString()}</div>
          )}
        </div>
      </div>
      <div className="flex items-start justify-end gap-1 pt-0.5">
        <button
          type="button"
          onClick={() => onRunNow(mission.id)}
          disabled={ops === "running"}
          className="p-2 text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Exécuter maintenant"
        >
          <GhostIconPlay className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onEdit(mission)}
          className="p-2 text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
          title="Modifier"
        >
          <GhostIconPencil className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(mission)}
          className="p-2 text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors"
          title="Supprimer"
        >
          <GhostIconTrash className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
