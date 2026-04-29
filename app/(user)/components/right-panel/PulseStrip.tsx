"use client";

/**
 * PulseStrip — Status minimal du système en tête du RightPanel.
 *
 * Affiche l'état courant de façon claire et concise :
 * - Halo visuel (statique ou animé selon l'état)
 * - Label d'état (En veille / En cours / Validation / Erreur)
 * - Contexte optionnel (nom du flow, erreur, etc.)
 */

import { useRuntimeStore } from "@/stores/runtime";

type SystemState = "idle" | "running" | "awaiting" | "error";

interface StatusConfig {
  label: string;
  color: string;
  animate: boolean;
  dotPulse: boolean;
}

const STATUS_CONFIG: Record<SystemState, StatusConfig> = {
  idle: {
    label: "En veille",
    color: "var(--text-faint)",
    animate: false,
    dotPulse: false,
  },
  running: {
    label: "En cours",
    color: "var(--cykan)",
    animate: true,
    dotPulse: true,
  },
  awaiting: {
    label: "En attente",
    color: "var(--warn)",
    animate: false,
    dotPulse: true,
  },
  error: {
    label: "Erreur",
    color: "var(--danger)",
    animate: false,
    dotPulse: false,
  },
};

function StatusHalo({ state: _state, config }: { state: SystemState; config: StatusConfig }) {
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: "var(--space-12)", height: "var(--space-12)" }}
    >
      {/* Cercle extérieur */}
      <div
        className="absolute inset-0 rounded-full border"
        style={{
          borderColor: config.color,
          opacity: 0.3,
        }}
      />

      {/* Anneau animé si running */}
      {config.animate && (
        <div
          className="absolute inset-1 rounded-full border-2 border-t-transparent"
          style={{
            borderColor: config.color,
            animation: "spin 2s linear infinite",
          }}
        />
      )}

      {/* Cœur central */}
      <div
        className="w-3 h-3 rounded-full"
        style={{
          backgroundColor: config.color,
          boxShadow: config.dotPulse ? `0 0 12px ${config.color}` : "none",
          animation: config.dotPulse ? "pulse 2s ease-in-out infinite" : "none",
        }}
      />
    </div>
  );
}

export function PulseStrip() {
  const coreState = useRuntimeStore((s) => s.coreState);
  const flowLabel = useRuntimeStore((s) => s.flowLabel);
  const events = useRuntimeStore((s) => s.events);

  // Détermine l'état système
  const getSystemState = (): SystemState => {
    if (coreState === "error") return "error";
    if (coreState === "awaiting_approval" || coreState === "awaiting_clarification") {
      return "awaiting";
    }
    if (coreState === "idle") return "idle";
    return "running";
  };

  const systemState = getSystemState();
  const config = STATUS_CONFIG[systemState];

  // Contexte à afficher
  const contextText = flowLabel || (systemState === "idle" ? "Prêt à démarrer" : "Traitement...");

  // Compteur d'assets générés dans cette session
  const assetsCount = events.filter((e) => e.type === "asset_generated").length;

  return (
    <div
      className="border-b border-[var(--border-shell)] flex items-center gap-4 px-4"
      style={{
        height: "var(--height-strip-pulse)",
        background: "var(--bg-rail)",
      }}
      role="status"
    >
      {/* Halo de status */}
      <StatusHalo state={systemState} config={config} />

      {/* Info centrale */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {/* État */}
        <div className="flex items-center gap-2">
          <span
            className="t-9 font-mono uppercase tracking-display"
            style={{ color: config.color }}
          >
            {config.label}
          </span>
          {assetsCount > 0 && systemState !== "idle" && (
            <span
              className="t-9 font-mono"
              style={{ color: "var(--text-ghost)" }}
            >
              · {assetsCount} asset{assetsCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Contexte / Flow */}
        <span
          className="t-13 text-[var(--text-soft)] truncate leading-snug"
          title={contextText}
        >
          {contextText}
        </span>
      </div>

      {/* Compteur events — toujours rendu pour stabilité layout */}
      <div
        className="flex flex-col items-end"
        style={{ minWidth: "var(--space-12)" }}
      >
        <span
          className="t-15 font-bold font-mono"
          style={{
            color: events.length > 0 ? config.color : "var(--text-ghost)",
          }}
        >
          {events.length.toString().padStart(2, "0")}
        </span>
        <span className="t-8 font-mono uppercase text-[var(--text-ghost)]">
          evt
        </span>
      </div>

      {/* Animation keyframes inline */}
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
