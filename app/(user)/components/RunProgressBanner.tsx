"use client";

/**
 * RunProgressBanner — bandeau de progression entre les messages et le ChatInput.
 *
 * Visible uniquement quand un run est en cours (coreState !== "idle").
 * Affiche le dernier step actif et le label du flow pour donner du feedback
 * immédiat pendant la génération d'un report ou l'exécution d'une action.
 *
 * Structure fixe : même hauteur qu'il soit vide (idle) ou actif — pas de
 * jump de layout.
 */

import { useRuntimeStore } from "@/stores/runtime";

export function RunProgressBanner() {
  const coreState = useRuntimeStore((s) => s.coreState);
  const flowLabel = useRuntimeStore((s) => s.flowLabel);
  const events = useRuntimeStore((s) => s.events);

  const isIdle = coreState === "idle";
  const isError = coreState === "error";
  const isAwaiting =
    coreState === "awaiting_approval" || coreState === "awaiting_clarification";

  // Dernier step démarré — contexte le plus récent.
  const lastStep = [...events]
    .reverse()
    .find((e) => e.type === "step_started" && "title" in e);
  const stepTitle = lastStep && "title" in lastStep ? (lastStep.title as string) : null;

  const accentColor = isError
    ? "var(--danger)"
    : isAwaiting
      ? "var(--warn)"
      : "var(--cykan)";

  return (
    <div
      className="shrink-0 border-t border-[var(--surface-2)] flex items-center"
      style={{
        height: "var(--space-8)",
        background: "var(--bg-soft)",
        overflow: "hidden",
        transition: "opacity var(--duration-base) var(--ease-standard)",
        opacity: isIdle ? 0 : 1,
        pointerEvents: "none",
      }}
      aria-hidden={isIdle}
    >
      {!isIdle && (
        <div className="flex items-center gap-3 px-5 w-full">
          {/* Dot animé */}
          <span
            className={`shrink-0 w-1.5 h-1.5 rounded-pill ${!isError && !isAwaiting ? "animate-pulse" : ""}`}
            style={{ background: accentColor }}
          />

          {/* Label flow + step */}
          <span
            className="t-9 font-medium truncate"
            style={{ color: accentColor }}
          >
            {isError
              ? "Erreur"
              : isAwaiting
                ? "En attente de validation"
                : stepTitle
                  ? `${stepTitle}…`
                  : flowLabel
                    ? `${flowLabel}…`
                    : "Traitement…"}
          </span>
        </div>
      )}
    </div>
  );
}
