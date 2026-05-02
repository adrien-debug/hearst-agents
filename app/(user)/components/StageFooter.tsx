"use client";

/**
 * StageFooter — barre discrète sous ChatDock, état LLM live.
 *
 * Trois dots animés à gauche + label voix régulière FR au centre + meta
 * (events / coût) à droite. Reflète `useRuntimeStore.coreState` :
 *
 *   idle                    → heartbeat lent (1 dot cykan calme)
 *   connecting              → wave loading 3 dots cykan
 *   streaming               → wave rapide 3 dots cykan
 *   processing              → wave moyenne 3 dots cykan
 *   awaiting_approval       → 3 dots gold static
 *   awaiting_clarification  → 3 dots cykan static, dot médian pulse
 *   error                   → 3 dots danger static
 *
 * Hauteur fixe var(--height-stage-footer). Bordure top var(--border-subtle)
 * pour séparer visuellement de ChatDock sans coquille flottante.
 */

import { useRuntimeStore, type CoreState } from "@/stores/runtime";
import { useNavigationStore } from "@/stores/navigation";

interface StateConfig {
  label: string;
  tone: "cykan" | "gold" | "danger" | "muted";
  pattern: "heartbeat" | "wave-fast" | "wave-medium" | "wave-slow" | "static" | "pulse-mid";
}

const STATE_MAP: Record<CoreState, StateConfig> = {
  idle: { label: "Veille", tone: "muted", pattern: "heartbeat" },
  connecting: { label: "Connexion", tone: "cykan", pattern: "wave-medium" },
  streaming: { label: "En cours", tone: "cykan", pattern: "wave-fast" },
  processing: { label: "Traitement", tone: "cykan", pattern: "wave-slow" },
  awaiting_approval: { label: "Approbation requise", tone: "gold", pattern: "static" },
  awaiting_clarification: { label: "Précision requise", tone: "cykan", pattern: "pulse-mid" },
  error: { label: "Erreur", tone: "danger", pattern: "static" },
};

const TONE_VAR: Record<StateConfig["tone"], string> = {
  cykan: "var(--cykan)",
  gold: "var(--gold)",
  danger: "var(--danger)",
  muted: "var(--text-faint)",
};

export function StageFooter() {
  const coreState = useRuntimeStore((s) => s.coreState);
  const flowLabel = useRuntimeStore((s) => s.flowLabel);
  const config = STATE_MAP[coreState];
  const color = TONE_VAR[config.tone];
  const leftCollapsed = useNavigationStore((s) => s.leftCollapsed);

  // Spacers calés sur les widths réels des rails pour que les dots
  // soient centrés sur l'axe horizontal du chat (centre du paper), et
  // pas sur le centre du viewport — les rails ne sont pas symétriques.
  const leftSpacer = leftCollapsed
    ? "var(--width-threads-collapsed)"
    : "var(--width-threads)";
  const rightSpacer = "var(--width-context)";
  const labelText = flowLabel && coreState !== "idle" ? flowLabel : config.label;

  return (
    <footer
      className="shrink-0 flex items-stretch"
      style={{
        height: "var(--height-stage-footer)",
        borderTop: "1px solid var(--border-subtle)",
        background: "var(--rail)",
        color: "var(--text-soft)",
      }}
      aria-live="polite"
      aria-label={labelText}
    >
      <div className="shrink-0" style={{ width: leftSpacer }} aria-hidden />
      <div className="flex-1 flex items-center justify-center min-w-0">
        <DotsCluster pattern={config.pattern} color={color} />
      </div>
      <div className="shrink-0" style={{ width: rightSpacer }} aria-hidden />
    </footer>
  );
}

function DotsCluster({
  pattern,
  color,
}: {
  pattern: StateConfig["pattern"];
  color: string;
}) {
  // Trois dots, animation contrôlée par classes globales définies dans
  // globals.css (sf-dot-* keyframes). Le delay décale chaque dot pour
  // créer une vague visuelle.
  const delays = [0, 150, 300];
  return (
    <span
      className="inline-flex items-center"
      style={{ gap: "var(--space-1)" }}
      aria-hidden
    >
      {delays.map((delay, i) => (
        <span
          key={i}
          className={`sf-dot sf-dot-${pattern}`}
          data-index={i}
          style={
            {
              background: color,
              animationDelay: `${delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
