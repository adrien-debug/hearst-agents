"use client";

/**
 * SimulationStage — Chambre de Simulation (Signature 5).
 *
 * 3 états : idle (formulaire), running (DeepSeek raisonne), done (cartes
 * scénarios). MVP : DeepSeek R1 uniquement. Phase B suivante : E2B
 * validera les calculs, Exa enrichira les benchmarks.
 */

import { useCallback, useState } from "react";
import { useStageStore } from "@/stores/stage";
import { ThinkingDisclosure } from "../ThinkingDisclosure";
import { toast } from "@/app/hooks/use-toast";

interface Variable {
  key: string;
  value: string;
}

interface Scenario {
  name: string;
  narrative: string;
  metrics: Record<string, string>;
  risks: string[];
  probability: number;
}

type Phase = "idle" | "running" | "done";

interface SimulationResponse {
  scenarios?: Scenario[];
  reasoning?: string | null;
  error?: string;
  message?: string;
}

export function SimulationStage() {
  const back = useStageStore((s) => s.back);

  const [phase, setPhase] = useState<Phase>("idle");
  const [scenarioInput, setScenarioInput] = useState("");
  const [variables, setVariables] = useState<Variable[]>([{ key: "", value: "" }]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [reasoning, setReasoning] = useState<string | null>(null);

  const updateVariable = useCallback((idx: number, patch: Partial<Variable>) => {
    setVariables((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  }, []);

  const addVariable = useCallback(() => {
    setVariables((prev) => [...prev, { key: "", value: "" }]);
  }, []);

  const removeVariable = useCallback((idx: number) => {
    setVariables((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    setScenarios([]);
    setReasoning(null);
  }, []);

  const launchSimulation = useCallback(async () => {
    const scenario = scenarioInput.trim();
    if (!scenario) {
      toast.error("Scénario requis", "Décris le scénario business à simuler.");
      return;
    }
    const cleanedVariables = variables
      .map((v) => ({ key: v.key.trim(), value: v.value.trim() }))
      .filter((v) => v.key.length > 0);

    setPhase("running");
    setScenarios([]);
    setReasoning(null);
    try {
      const res = await fetch("/api/v2/simulations/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, variables: cleanedVariables }),
      });
      const data = (await res.json()) as SimulationResponse;
      if (!res.ok || !Array.isArray(data.scenarios)) {
        toast.error("Échec simulation", data.message || data.error || "Sortie DeepSeek invalide");
        setPhase("idle");
        return;
      }
      setScenarios(data.scenarios);
      setReasoning(data.reasoning ?? null);
      setPhase("done");
    } catch (err) {
      toast.error("Erreur réseau", err instanceof Error ? err.message : String(err));
      setPhase("idle");
    }
  }, [scenarioInput, variables]);

  const headerLabel = phase === "running" ? "RAISONNEMENT" : phase === "done" ? "SCÉNARIOS" : "STANDBY";

  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative"
      style={{ background: "var(--bg-center)" }}
    >
      <header className="flex items-center justify-between px-12 py-6 flex-shrink-0 border-b border-[var(--border-default)]">
        <div className="flex items-center gap-4">
          <span
            className="rounded-pill bg-[var(--cykan)] animate-pulse halo-dot"
            style={{ width: "var(--space-2)", height: "var(--space-2)" }}
          />
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">
            SIMULATION
          </span>
          <span
            className="rounded-pill bg-[var(--text-ghost)]"
            style={{ width: "var(--space-1)", height: "var(--space-1)" }}
          />
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-muted)]">
            {headerLabel}
          </span>
        </div>
        <button
          onClick={back}
          className="halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-9 font-mono uppercase tracking-section border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all shrink-0"
        >
          <span>Retour</span>
          <span className="opacity-60">⌘⌫</span>
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div
          className="max-w-3xl mx-auto flex flex-col gap-8"
          style={{ padding: "var(--space-12) var(--space-8)" }}
        >
          {phase === "idle" && (
            <SimulationForm
              scenarioInput={scenarioInput}
              onScenarioChange={setScenarioInput}
              variables={variables}
              onVariableChange={updateVariable}
              onVariableAdd={addVariable}
              onVariableRemove={removeVariable}
              onLaunch={() => void launchSimulation()}
            />
          )}

          {phase === "running" && <SimulationRunning />}

          {phase === "done" && (
            <SimulationResults
              scenarios={scenarios}
              reasoning={reasoning}
              onReset={reset}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Form (idle) ─────────────────────────────────────────────────

interface SimulationFormProps {
  scenarioInput: string;
  onScenarioChange: (value: string) => void;
  variables: Variable[];
  onVariableChange: (idx: number, patch: Partial<Variable>) => void;
  onVariableAdd: () => void;
  onVariableRemove: (idx: number) => void;
  onLaunch: () => void;
}

function SimulationForm({
  scenarioInput,
  onScenarioChange,
  variables,
  onVariableChange,
  onVariableAdd,
  onVariableRemove,
  onLaunch,
}: SimulationFormProps) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
          SCÉNARIO
        </span>
        <textarea
          value={scenarioInput}
          onChange={(e) => onScenarioChange(e.target.value)}
          placeholder="ex: lancer une nouvelle ligne SaaS PME en Europe au Q3, budget 800k€"
          rows={4}
          className="w-full bg-transparent border border-[var(--border-shell)] focus:outline-none focus:border-[var(--cykan)] t-13 text-[var(--text)] placeholder:text-[var(--text-faint)] resize-y"
          style={{ padding: "var(--space-3)", borderRadius: "var(--radius-sm)" }}
        />
      </div>

      <div className="flex flex-col gap-4">
        <header className="flex items-center justify-between">
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
            VARIABLES CLÉS
          </span>
          <button
            type="button"
            onClick={onVariableAdd}
            className="halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-9 font-mono uppercase tracking-section border border-[var(--border-shell)] text-[var(--text-muted)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all"
          >
            + Ajouter
          </button>
        </header>
        <div className="flex flex-col gap-3">
          {variables.map((variable, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <input
                type="text"
                value={variable.key}
                onChange={(e) => onVariableChange(idx, { key: e.target.value })}
                placeholder="Variable"
                className="flex-1 min-w-0 bg-transparent border border-[var(--border-shell)] focus:outline-none focus:border-[var(--cykan)] t-13 text-[var(--text)] placeholder:text-[var(--text-faint)]"
                style={{ padding: "var(--space-3)", borderRadius: "var(--radius-sm)" }}
              />
              <input
                type="text"
                value={variable.value}
                onChange={(e) => onVariableChange(idx, { value: e.target.value })}
                placeholder="Valeur"
                className="flex-1 min-w-0 bg-transparent border border-[var(--border-shell)] focus:outline-none focus:border-[var(--cykan)] t-13 text-[var(--text)] placeholder:text-[var(--text-faint)]"
                style={{ padding: "var(--space-3)", borderRadius: "var(--radius-sm)" }}
              />
              <button
                type="button"
                onClick={() => onVariableRemove(idx)}
                disabled={variables.length === 1}
                className="halo-on-hover w-8 h-8 flex items-center justify-center t-13 text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Retirer la variable"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onLaunch}
        disabled={!scenarioInput.trim()}
        className="halo-on-hover px-6 py-3 t-9 font-mono uppercase tracking-marquee bg-[var(--cykan)] text-[var(--bg)] hover:tracking-[0.4em] transition-all duration-slow disabled:opacity-60"
      >
        Lancer la simulation
      </button>
    </div>
  );
}

// ── Running ─────────────────────────────────────────────────────

function SimulationRunning() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
      <span
        className="rounded-pill bg-[var(--warn)] animate-pulse"
        style={{ width: "var(--space-4)", height: "var(--space-4)" }}
        aria-hidden
      />
      <p
        className="t-15 font-medium text-[var(--text)]"
        style={{ lineHeight: "var(--leading-snug)" }}
      >
        Génération de scénarios… DeepSeek R1 raisonne.
      </p>
      <p className="t-11 font-mono uppercase tracking-marquee text-[var(--text-ghost)]">
        30-50 secondes habituellement
      </p>
    </div>
  );
}

// ── Results (done) ──────────────────────────────────────────────

interface SimulationResultsProps {
  scenarios: Scenario[];
  reasoning: string | null;
  onReset: () => void;
}

function SimulationResults({ scenarios, reasoning, onReset }: SimulationResultsProps) {
  return (
    <div className="flex flex-col gap-6">
      {reasoning && <ThinkingDisclosure thinking={reasoning} />}

      <div className="flex flex-col gap-4">
        {scenarios.length === 0 ? (
          <p className="t-13 text-[var(--text-muted)]">Aucun scénario retourné.</p>
        ) : (
          scenarios.map((scenario, idx) => <ScenarioCard key={idx} scenario={scenario} />)
        )}
      </div>

      <button
        type="button"
        onClick={onReset}
        className="self-start halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-9 font-mono uppercase tracking-section border border-[var(--border-shell)] text-[var(--text-muted)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all"
      >
        Nouvelle simulation
      </button>
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  const probabilityPct = Math.max(0, Math.min(100, Math.round(scenario.probability * 100)));
  const metricsEntries = Object.entries(scenario.metrics ?? {});
  const risks = Array.isArray(scenario.risks) ? scenario.risks : [];

  return (
    <article
      className="flex flex-col gap-4 border-l-2 border-[var(--cykan)]/30 bg-[var(--surface-1)]"
      style={{ padding: "var(--space-6)" }}
    >
      <header className="flex items-start justify-between gap-4">
        <h3 className="t-15 font-medium text-[var(--text)]">{scenario.name}</h3>
        <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)] shrink-0">
          PROB · {probabilityPct}%
        </span>
      </header>

      {scenario.narrative && (
        <p className="t-13 text-[var(--text-muted)]" style={{ lineHeight: "var(--leading-base)" }}>
          {scenario.narrative}
        </p>
      )}

      {metricsEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {metricsEntries.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1">
              <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
                {label}
              </span>
              <span className="t-13 text-[var(--text)]">{value}</span>
            </div>
          ))}
        </div>
      )}

      {risks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {risks.map((risk, idx) => (
            <span
              key={idx}
              className="t-9 font-mono uppercase tracking-display border border-[var(--warn)]/40 text-[var(--warn)] px-2 py-1"
            >
              {risk}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
