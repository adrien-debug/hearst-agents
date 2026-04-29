"use client";

/**
 * Gantt — timeline projet (tâches avec début/fin, progression, dépendances).
 *
 * Modèle de données :
 *   range: { start: ISODate, end: ISODate }
 *   tasks: [
 *     {
 *       id: "t1",
 *       label: "Spec technique",
 *       start: "2026-05-01",
 *       end: "2026-05-08",
 *       progress: 0.6,
 *       dependsOn?: ["t0"]
 *     },
 *     …
 *   ]
 *
 * Visuel Ghost Protocol :
 *   - axe temporel horizontal (ticks days/weeks/months selon la durée)
 *   - une row par tâche : label à gauche en t-11, barre à droite
 *   - barre tâche : background var(--surface-2), progress en var(--cykan)
 *   - dépendances : ligne pointillée fine de end-source → start-target
 *     avec tête de flèche en var(--text-faint)
 *
 * Pas de magic number. Couleur unique = cykan, l'opacité encode la progression.
 */

import { fmtNumber } from "./format";

export interface GanttRange {
  start: string; // ISODate (YYYY-MM-DD ou ISO complet)
  end: string;
}

export interface GanttTask {
  id: string;
  label: string;
  start: string;
  end: string;
  progress: number; // 0..1
  dependsOn?: ReadonlyArray<string>;
}

export interface GanttProps {
  range: GanttRange;
  tasks: ReadonlyArray<GanttTask>;
  /** Hauteur graphique en pixels. Défaut auto = tasks.length * row + axis. */
  height?: number;
}

// ── Constantes layout (viewBox normalisée) ─────────────────────
const VB_W = 1000;
const ROW_H = 28; // hauteur d'une ligne tâche en unités viewBox
const AXIS_H = 32; // bandeau axe temporel
const LEFT_COL = 220; // largeur colonne labels gauche
const BAR_PAD = 6; // padding vertical interne d'une barre
const TICK_TARGET = 8; // nombre cible de ticks sur l'axe

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDate(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Number.NaN;
}

function pickTickStep(rangeMs: number): { stepMs: number; label: "day" | "week" | "month" } {
  // Choisit l'unité temporelle selon la durée totale pour ~TICK_TARGET ticks.
  const days = rangeMs / MS_PER_DAY;
  if (days <= TICK_TARGET * 1.5) return { stepMs: MS_PER_DAY, label: "day" };
  if (days <= TICK_TARGET * 7 * 1.5) return { stepMs: MS_PER_DAY * 7, label: "week" };
  return { stepMs: MS_PER_DAY * 30, label: "month" };
}

function fmtTick(ms: number, kind: "day" | "week" | "month"): string {
  const d = new Date(ms);
  if (kind === "day") {
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  }
  if (kind === "week") {
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  }
  return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
}

export function Gantt({ range, tasks, height }: GanttProps) {
  const startMs = parseDate(range?.start ?? "");
  const endMs = parseDate(range?.end ?? "");
  const rangeValid = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;

  if (!rangeValid) {
    return (
      <div
        className="t-9 font-mono uppercase tracking-[0.2em] text-[var(--text-faint)]"
        style={{ padding: "var(--space-6)" }}
        role="img"
        aria-label="Gantt sans période"
      >
        Aucune période définie
      </div>
    );
  }

  const totalMs = endMs - startMs;
  const { stepMs, label: tickKind } = pickTickStep(totalMs);
  const ticks: number[] = [];
  // Aligne le premier tick sur startMs lui-même puis incrémente.
  for (let t = startMs; t <= endMs; t += stepMs) ticks.push(t);
  if (ticks[ticks.length - 1] !== endMs) ticks.push(endMs);

  const safeTasks = (tasks ?? []).filter((t) => {
    const s = parseDate(t.start);
    const e = parseDate(t.end);
    return Number.isFinite(s) && Number.isFinite(e) && e > s;
  });

  const rows = Math.max(1, safeTasks.length);
  const VB_H = AXIS_H + rows * ROW_H + BAR_PAD;
  const CHART_W = VB_W - LEFT_COL;

  // Mappe ms → x dans le viewBox.
  const xFor = (ms: number) =>
    LEFT_COL + ((ms - startMs) / totalMs) * CHART_W;

  // Position y du milieu d'une row (tâche index i).
  const yMid = (i: number) => AXIS_H + i * ROW_H + ROW_H / 2;

  // Index par id pour résoudre les dépendances.
  const idxById = new Map<string, number>();
  safeTasks.forEach((t, i) => idxById.set(t.id, i));

  // Hauteur d'affichage : auto si non fourni, proportionnelle au nb de tâches.
  const displayH = height ?? Math.max(160, AXIS_H + rows * ROW_H + BAR_PAD);

  return (
    <div
      role="img"
      aria-label={`Gantt ${safeTasks.length} tâches`}
      className="flex flex-col w-full"
      style={{ gap: "var(--space-3)" }}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="block w-full"
        style={{ height: displayH }}
      >
        <title>Gantt — {safeTasks.length} tâches</title>

        {/* Définitions : tête de flèche pour les dépendances */}
        <defs>
          <marker
            id="gantt-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 z"
              fill="var(--text-faint)"
            />
          </marker>
        </defs>

        {/* Axe temporel : ligne supérieure + ticks */}
        <line
          x1={LEFT_COL}
          y1={AXIS_H}
          x2={VB_W}
          y2={AXIS_H}
          stroke="var(--surface-2)"
          strokeWidth={0.6}
        />
        {ticks.map((ms, i) => {
          const x = xFor(ms);
          return (
            <g key={`tick-${i}`}>
              <line
                x1={x}
                y1={AXIS_H - 4}
                x2={x}
                y2={VB_H}
                stroke="var(--surface-2)"
                strokeWidth={0.4}
                strokeDasharray="2 3"
              />
              <text
                x={x}
                y={AXIS_H - 8}
                textAnchor="middle"
                dominantBaseline="alphabetic"
                fill="var(--text-muted)"
                className="t-9 font-mono uppercase"
                style={{ letterSpacing: "0.15em" }}
              >
                {fmtTick(ms, tickKind)}
              </text>
            </g>
          );
        })}

        {/* Rows + labels gauche + barres */}
        {safeTasks.length === 0 ? (
          <text
            x={LEFT_COL + CHART_W / 2}
            y={AXIS_H + ROW_H / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--text-faint)"
            className="t-9 font-mono uppercase"
            style={{ letterSpacing: "0.2em" }}
          >
            Aucune tâche
          </text>
        ) : (
          safeTasks.map((task, i) => {
            const sMs = parseDate(task.start);
            const eMs = parseDate(task.end);
            const x1 = xFor(Math.max(startMs, sMs));
            const x2 = xFor(Math.min(endMs, eMs));
            const w = Math.max(2, x2 - x1);
            const y = yMid(i);
            const barTop = y - (ROW_H - BAR_PAD * 2) / 2;
            const barH = ROW_H - BAR_PAD * 2;
            const progress = Math.max(0, Math.min(1, Number.isFinite(task.progress) ? task.progress : 0));
            const progressW = Math.max(0, w * progress);

            return (
              <g key={`task-${task.id}-${i}`}>
                {/* Séparateur de row (sauf la première) */}
                {i > 0 && (
                  <line
                    x1={0}
                    y1={AXIS_H + i * ROW_H}
                    x2={VB_W}
                    y2={AXIS_H + i * ROW_H}
                    stroke="var(--surface-2)"
                    strokeWidth={0.4}
                  />
                )}

                {/* Label tâche à gauche */}
                <text
                  x={LEFT_COL - 12}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="var(--text-soft)"
                  className="t-11"
                >
                  <title>{task.label}</title>
                  {task.label.length > 26 ? `${task.label.slice(0, 25)}…` : task.label}
                </text>

                {/* Barre background */}
                <rect
                  x={x1}
                  y={barTop}
                  width={w}
                  height={barH}
                  fill="var(--surface-2)"
                  rx={2}
                />
                {/* Progression */}
                <rect
                  x={x1}
                  y={barTop}
                  width={progressW}
                  height={barH}
                  fill="var(--cykan)"
                  fillOpacity={0.85}
                  rx={2}
                >
                  <title>
                    {`${task.label} — ${fmtNumber(progress * 100, { decimals: 0 })} %`}
                  </title>
                </rect>
                {/* Cadre fin pour lisibilité quand progression=0 */}
                <rect
                  x={x1}
                  y={barTop}
                  width={w}
                  height={barH}
                  fill="none"
                  stroke="var(--cykan)"
                  strokeOpacity={0.35}
                  strokeWidth={0.6}
                  rx={2}
                />
              </g>
            );
          })
        )}

        {/* Dépendances : pointillés end-source → start-target avec flèche */}
        {safeTasks.flatMap((task, i) => {
          const deps = task.dependsOn ?? [];
          return deps.map((depId, di) => {
            const sourceIdx = idxById.get(depId);
            if (sourceIdx === undefined) return null;
            const source = safeTasks[sourceIdx];
            const sourceEnd = parseDate(source.end);
            const targetStart = parseDate(task.start);
            const x1 = xFor(Math.min(endMs, sourceEnd));
            const y1 = yMid(sourceIdx);
            const x2 = xFor(Math.max(startMs, targetStart));
            const y2 = yMid(i);
            // Coude orthogonal : sort à droite de la source, descend, entre par la gauche.
            const elbowX = Math.max(x1 + 8, x2 - 8);
            const path = `M ${x1} ${y1} L ${elbowX} ${y1} L ${elbowX} ${y2} L ${x2} ${y2}`;
            return (
              <path
                key={`dep-${task.id}-${depId}-${di}`}
                d={path}
                fill="none"
                stroke="var(--text-faint)"
                strokeWidth={0.8}
                strokeDasharray="3 3"
                markerEnd="url(#gantt-arrow)"
              />
            );
          });
        })}
      </svg>
    </div>
  );
}
