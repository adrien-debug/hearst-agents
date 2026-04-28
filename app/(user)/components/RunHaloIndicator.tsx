"use client";

/**
 * Indicateur de runs des agents — header du RightPanel.
 *
 * 5 phases de pipeline (intent / search / analyze / synth / deliver),
 * chacune représentée par un cluster de 20 cells (4×5). État de chaque
 * cluster dérivé du runtime store :
 * - idle    : toutes les phases ghost (--surface-1)
 * - running : phases passées full cykan, phase courante 60% remplie
 *             (la dernière cell allumée pulse), phases à venir ghost
 * - approval: phase finale en warn (validation gating)
 * - error   : phase courante en danger
 *
 * La phase courante est dérivée du nombre de step_started events
 * modulo 5. Quand le runtime exposera des phases nommées explicites,
 * remplacer cette heuristique par la vraie source.
 */

import { useRuntimeStore } from "@/stores/runtime";

const PHASE_LABELS = ["intent", "search", "analyze", "synth", "deliver"] as const;
const TOTAL_PHASES = PHASE_LABELS.length;
const CELLS_PER_PHASE = 20;

export function RunHaloIndicator() {
  const coreState = useRuntimeStore((s) => s.coreState);
  const flowLabel = useRuntimeStore((s) => s.flowLabel);
  const currentRunId = useRuntimeStore((s) => s.currentRunId);
  const events = useRuntimeStore((s) => s.events);

  const stepCount = events.filter((e) => e.type === "step_started").length;

  const isIdle = coreState === "idle";
  const isError = coreState === "error";
  const isApproval = coreState === "awaiting_approval";
  const isClarification = coreState === "awaiting_clarification";
  const isRunning = !isIdle && !isError && !isApproval && !isClarification;

  let currentPhase = -1;
  if (isApproval) currentPhase = TOTAL_PHASES - 1;
  else if (isClarification) currentPhase = 0;
  else if (isError || isRunning) currentPhase = stepCount % TOTAL_PHASES;

  const phaseTag =
    isIdle ? "veille"
      : isApproval ? "approval"
      : isError ? "erreur"
      : currentPhase >= 0 ? PHASE_LABELS[currentPhase]
      : "veille";

  const accessibleLabel =
    isIdle ? "Agents en veille"
      : isApproval ? "Validation requise"
      : isClarification ? "Précision attendue"
      : isError ? "Erreur"
      : flowLabel || "Agents en cours";

  const idDisplay = currentRunId ? currentRunId.slice(-6).toUpperCase() : "—";

  return (
    <div
      className="halo-runs"
      data-state={coreState}
      role="status"
      aria-label={accessibleLabel}
    >
      <div className="halo-runs-row halo-runs-top">
        <span>RUN <strong>{idDisplay}</strong></span>
        <span>{currentPhase < 0 ? "—" : `${currentPhase + 1} / ${TOTAL_PHASES}`}</span>
      </div>
      <div className="halo-runs-grid">
        {PHASE_LABELS.map((label, phaseIdx) => {
          const phaseState =
            currentPhase < 0 ? "todo"
              : phaseIdx < currentPhase ? "done"
              : phaseIdx === currentPhase ? "current"
              : "todo";
          return (
            <div
              key={label}
              className="halo-runs-phase"
              data-phase-name={label}
              data-phase-state={phaseState}
            >
              {Array.from({ length: CELLS_PER_PHASE }, (_, cellIdx) => (
                <span key={cellIdx} className="halo-runs-cell" />
              ))}
            </div>
          );
        })}
      </div>
      <div className="halo-runs-row halo-runs-bot">
        <span className="halo-runs-state">
          <span className="halo-runs-dot" aria-hidden />
          {phaseTag}
        </span>
        <span className="halo-runs-flow">{accessibleLabel}</span>
      </div>
    </div>
  );
}
