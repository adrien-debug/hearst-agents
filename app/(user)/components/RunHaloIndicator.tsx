"use client";

/**
 * Indicateur de runs des agents — symétrique au logo gauche.
 *
 * Bloc fixe au top du RightPanel (même hauteur que le bloc logo).
 * Wired sur le runtime store : la couleur, la longueur d'arc et la
 * vitesse de rotation suivent l'état (idle / streaming / approval /
 * error). Aucun progrès chiffré n'étant exposé par le runtime, on
 * affiche un spinner indéterminé en cours et un anneau plein quand
 * une action utilisateur est attendue ("100%").
 */

import { useRuntimeStore } from "@/stores/runtime";

export function RunHaloIndicator() {
  const coreState = useRuntimeStore((s) => s.coreState);

  const label =
    coreState === "idle" ? "Agents en veille"
    : coreState === "awaiting_approval" ? "Validation requise"
    : coreState === "awaiting_clarification" ? "Précision attendue"
    : coreState === "error" ? "Erreur"
    : "Agents en cours";

  return (
    <div
      className="halo-runs"
      data-state={coreState}
      role="status"
      aria-label={label}
      title={label}
    >
      <div className="halo-runs-spinner">
        <svg viewBox="0 0 100 100" aria-hidden focusable="false">
          {/* Track de fond — currentColor sur .halo-runs (themable) */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            opacity="0.22"
          />
          {/* Arc actif — couleur + longueur pilotées par CSS data-state */}
          <circle
            className="halo-runs-arc"
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="1.8"
            strokeLinecap="round"
            pathLength="100"
          />
        </svg>
      </div>
      <span className="halo-runs-dot" aria-hidden />
    </div>
  );
}
