"use client";

/**
 * ContextRail — Rail droit polymorphe (post-pivot 2026-04-29).
 *
 * Dispatch selon `useStageStore.current.mode`. Chaque mode rend ses propres
 * sections directement — pas de sous-navigation à onglets, pas de composant
 * orchestrateur intermédiaire (RightPanelContent retiré du chemin critique).
 *
 * Règle « structure fixe par Stage » : chaque sub-rail rend SES sections
 * inconditionnellement, avec empty state interne. Pas de
 * `{section.length > 0 && ...}` autour d'un bloc complet.
 */

import { useRouter } from "next/navigation";
import { useStageStore } from "@/stores/stage";
import { useStageData } from "@/stores/stage-data";
import { useVoiceStore } from "@/stores/voice";
import { useServicesStore } from "@/stores/services";
import { voiceToolDefs, VOICE_TOOL_LABELS } from "@/lib/voice/tool-defs";
import { useRightPanelData } from "./right-panel/useRightPanelData";
import { GeneralDashboard } from "./right-panel/GeneralDashboard";

interface ContextRailProps {
  onClose?: () => void;
}

export function ContextRail({ onClose }: ContextRailProps) {
  const mode = useStageStore((s) => s.current.mode);

  switch (mode) {
    case "cockpit":
      return (
        <ContextRailShell onClose={onClose}>
          <ContextRailForCockpit />
        </ContextRailShell>
      );
    case "chat":
      return (
        <ContextRailShell onClose={onClose}>
          <ContextRailForChat />
        </ContextRailShell>
      );
    case "asset":
      return (
        <ContextRailShell onClose={onClose}>
          <ContextRailForAsset />
        </ContextRailShell>
      );
    case "browser":
      return (
        <ContextRailShell onClose={onClose}>
          <ContextRailForBrowser />
        </ContextRailShell>
      );
    case "meeting":
      return (
        <ContextRailShell onClose={onClose}>
          <ContextRailForMeeting />
        </ContextRailShell>
      );
    case "kg":
      return (
        <ContextRailShell onClose={onClose}>
          <ContextRailForKnowledge />
        </ContextRailShell>
      );
    case "voice":
      return (
        <ContextRailShell onClose={onClose}>
          <ContextRailForVoice />
        </ContextRailShell>
      );
    case "simulation":
      return (
        <ContextRailShell onClose={onClose}>
          <ContextRailForSimulation />
        </ContextRailShell>
      );
    default:
      return null;
  }
}

function ContextRailShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <aside
      className="h-full flex flex-col z-20 relative overflow-hidden"
      style={{
        width: "var(--width-context)",
        background: "var(--layer-1)",
      }}
    >
      {onClose && (
        <div
          className="flex items-center justify-between"
          style={{
            padding: "var(--space-4)",
            boxShadow: "var(--shadow-divider-bottom-subtle)",
          }}
        >
          <p className="t-13 font-light text-[var(--text-soft)]">Context</p>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {children}
    </aside>
  );
}

// ── Section primitive (stable structure across sub-rails) ─

function Section({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="px-6 py-6">
      <header className="flex items-center justify-between mb-4">
        <span className="rail-section-label">{label}</span>
        {typeof count === "number" && (
          <span className="t-9 tracking-display uppercase text-[var(--text-ghost)]">
            {count.toString().padStart(2, "0")}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="t-10 tracking-body uppercase text-[var(--text-ghost)] font-light">
      {children}
    </p>
  );
}

// ── Sub-rails cockpit / chat ───────────────────────────────

function CockpitChatBody() {
  const router = useRouter();
  const {
    assets,
    missions,
    activeThreadId,
    loading,
  } = useRightPanelData();

  const handleViewChange = (view: "reports" | "missions" | "assets") => {
    if (view === "missions") router.push("/missions");
    else if (view === "assets") router.push("/assets");
    else if (view === "reports") router.push("/runs");
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <GeneralDashboard
          assets={assets}
          missions={missions}
          onViewChange={handleViewChange}
          activeThreadId={activeThreadId}
          loading={loading}
        />
      </div>
    </div>
  );
}


function ContextRailForCockpit() {
  return <CockpitChatBody />;
}

function ContextRailForChat() {
  return <CockpitChatBody />;
}

function SuggestionsFooter({
  suggestions,
  runningSpecs,
  onRun,
}: {
  suggestions: NonNullable<
    ReturnType<typeof useRightPanelData>["reportSuggestions"]
  >;
  runningSpecs: Set<string>;
  onRun: (specId: string, title: string) => Promise<void>;
}) {
  const visible = suggestions.filter((s) => !runningSpecs.has(s.specId)).slice(0, 3);
  return (
    <div
      className="shrink-0 border-t border-[var(--border-shell)] flex flex-col"
      style={{ padding: "var(--space-5) var(--space-4)", gap: "var(--space-4)", background: "var(--surface-card)" }}
    >
      <div className="flex items-center justify-between px-2">
        <span className="t-9 tracking-display uppercase text-[var(--text-faint)]">
          Suggestions
        </span>
        <span className="t-9 tracking-display uppercase text-[var(--text-ghost)]">
          {visible.length.toString().padStart(2, "0")}
        </span>
      </div>
      {visible.length === 0 ? (
        <p className="t-10 tracking-body uppercase text-[var(--text-ghost)] px-2 font-light">
          No suggestions available.
        </p>
      ) : (
        <ul className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          {visible.map((s) => {
            const isRunning = runningSpecs.has(s.specId);
            const isReady = s.status === "ready";
            return (
              <li key={s.specId}>
                <button
                  type="button"
                  onClick={() => onRun(s.specId, s.title)}
                  disabled={isRunning}
                  data-testid={`report-suggestion-${s.specId}`}
                  data-suggestion-status={s.status}
                  className="w-full text-left flex items-center justify-between rounded-md border border-[var(--border-soft)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-1)] focus-visible:outline-none focus-visible:border-[var(--cykan-border)] transition-all duration-300"
                  style={{ padding: "var(--space-3) var(--space-4)", background: "var(--surface-card)" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="t-13 font-light text-[var(--text-soft)] truncate">{s.title}</p>
                    <p className="t-10 text-[var(--text-faint)] truncate mt-1 tracking-wide">{s.description}</p>
                  </div>
                  <span
                    className="t-9 tracking-display uppercase ml-4 shrink-0"
                    style={{ color: isReady ? "var(--cykan)" : "var(--text-ghost)" }}
                  >
                    {isRunning
                      ? "..."
                      : isReady
                        ? "LANCER"
                        : `${s.requiredApps.length - s.missingApps.length}/${s.requiredApps.length}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Sub-rails par Stage (Phase A skeletons) ────────────────

function ContextRailForAsset() {
  const { variants, assetTitle } = useStageData((s) => s.asset);
  const readyVariants = variants.filter((v) => v.status === "ready");
  return (
    <div className="h-full overflow-y-auto">
      <Section label="Asset focus">
        <p className="t-13 font-light text-[var(--text-muted)] truncate">
          {assetTitle || "—"}
        </p>
      </Section>
      <Section label="Variants" count={readyVariants.length}>
        {readyVariants.length === 0 ? (
          <EmptyHint>
            Texte uniquement — génère audio/vidéo/code via les onglets
          </EmptyHint>
        ) : (
          <ul className="flex flex-col gap-2">
            {readyVariants.map((v) => (
              <li key={v.id} className="flex items-baseline gap-3">
                <span className="t-9 tracking-display uppercase text-[var(--cykan)]">
                  {v.kind.toUpperCase()}
                </span>
                <span className="t-11 text-[var(--text-faint)] tracking-wide">
                  {v.provider ?? ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

    </div>
  );
}

function ContextRailForBrowser() {
  return (
    <div className="h-full overflow-y-auto">


      <Section label="Co-pilote">
        <p className="t-13 font-light text-[var(--text-faint)] leading-relaxed">
          L{"'"}agent navigue dans la session live. Take Over arrivera avec
          Stagehand.
        </p>
      </Section>
    </div>
  );
}

function ContextRailForMeeting() {
  const { actionItems, status } = useStageData((s) => s.meeting);
  return (
    <div className="h-full overflow-y-auto">
      <Section label="Action Items" count={actionItems.length}>
        {actionItems.length === 0 ? (
          <EmptyHint>
            {status ? "Analyse en cours…" : "En attente du transcript"}
          </EmptyHint>
        ) : (
          <ul className="flex flex-col gap-3">
            {actionItems.map((item, i) => (
              <li
                key={i}
                className="border-l border-[var(--cykan-border)] pl-4 py-1"
              >
                <p className="t-13 font-light text-[var(--text-soft)] truncate mb-1">
                  {item.action}
                </p>
                {(item.owner || item.deadline) && (
                  <p className="t-9 tracking-display uppercase text-[var(--text-ghost)]">
                    {[item.owner, item.deadline].filter(Boolean).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section label="Templates Mission">
        <p className="t-13 font-light text-[var(--text-faint)] leading-relaxed">
          Approve all → exécution Composio (Slack, Linear, Notion, Gmail).
        </p>
      </Section>
    </div>
  );
}

function ContextRailForKnowledge() {
  const { graph, selectedNode } = useStageData((s) => s.kg);
  return (
    <div className="h-full overflow-y-auto">
      <Section label="Entité focus">
        {selectedNode ? (
          <div className="flex flex-col gap-3">
            <span className="t-9 tracking-display uppercase text-[var(--cykan)]">
              {selectedNode.type}
            </span>
            <p className="t-13 font-light text-[var(--text-soft)]">{selectedNode.label}</p>
            {Object.keys(selectedNode.properties ?? {}).length > 0 && (
              <ul className="flex flex-col gap-2 mt-3">
                {Object.entries(
                  selectedNode.properties as Record<string, unknown>,
                )
                  .slice(0, 6)
                  .map(([k, v]) => (
                    <li key={k} className="flex items-baseline gap-3">
                      <span className="t-9 tracking-display uppercase text-[var(--text-ghost)] truncate">
                        {k}
                      </span>
                      <span className="t-11 font-light text-[var(--text-muted)] truncate">
                        {String(v)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        ) : (
          <EmptyHint>Click un nœud du graphe</EmptyHint>
        )}
      </Section>
      <Section label="Graphe" count={graph.nodes.length}>
        <p className="t-10 tracking-body uppercase text-[var(--text-ghost)] font-light">
          {graph.nodes.length} entités · {graph.edges.length} relations
        </p>
      </Section>

    </div>
  );
}

function ContextRailForVoice() {
  const transcript = useVoiceStore((s) => s.transcript);
  const phase = useVoiceStore((s) => s.phase);
  const services = useServicesStore((s) => s.services);
  const connectedApps = services.filter((s) => s.connectionStatus === "connected");
  const last10 = transcript.slice(-10);
  const totalToolsCount = voiceToolDefs.length + connectedApps.length;
  return (
    <div className="h-full overflow-y-auto">
      <Section label="Transcript live" count={transcript.length}>
        {transcript.length === 0 ? (
          <EmptyHint>
            {phase === "idle"
              ? "Active le mode voix pour démarrer"
              : "En attente du premier échange"}
          </EmptyHint>
        ) : (
          <ul className="flex flex-col gap-4">
            {last10.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1.5">
                <span
                  className={`t-9 tracking-display uppercase ${
                    entry.role === "user"
                      ? "text-[var(--cykan)]"
                      : "text-[var(--text-ghost)]"
                  }`}
                >
                  {entry.role === "user" ? "USER" : "AGENT"}
                </span>
                <p className="t-11 font-light text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                  {entry.text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section label="Tools disponibles" count={totalToolsCount}>
        <p className="t-10 tracking-body uppercase text-[var(--text-ghost)] font-light leading-relaxed">
          {[
            ...voiceToolDefs.map((t) => VOICE_TOOL_LABELS[t.name] ?? t.name),
            ...connectedApps.map((a) => a.name),
          ].join(" · ")}
        </p>
      </Section>
      <Section label="Voice settings">
        <p className="t-13 font-light text-[var(--text-faint)] leading-relaxed">
          Modèle{" "}
          <span className="text-[var(--cykan)]">openai-realtime</span>, latence
          cible &lt; 500&nbsp;ms.
        </p>
      </Section>
    </div>
  );
}

function ContextRailForSimulation() {
  const { variables, scenarios, phase } = useStageData((s) => s.simulation);
  const cleanVars = variables.filter((v) => v.key.trim());
  return (
    <div className="h-full overflow-y-auto">
      <Section label="Variables" count={cleanVars.length}>
        {cleanVars.length === 0 ? (
          <EmptyHint>Définis les inputs dans le formulaire</EmptyHint>
        ) : (
          <ul className="flex flex-col gap-3">
            {cleanVars.map((v, i) => (
              <li key={i} className="flex items-baseline gap-3">
                <span className="t-9 tracking-display uppercase text-[var(--text-ghost)] truncate">
                  {v.key}
                </span>
                <span className="t-13 font-light text-[var(--text-soft)] truncate">
                  {v.value || "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section label="Scénarios générés" count={scenarios.length}>
        {scenarios.length === 0 ? (
          <EmptyHint>
            {phase === "running" ? "DeepSeek raisonne…" : "Aucun scénario"}
          </EmptyHint>
        ) : (
          <ul className="flex flex-col gap-3">
            {scenarios.map((s, i) => (
              <li
                key={i}
                className="border-l border-[var(--cykan-border)] pl-4 py-1"
              >
                <p className="t-13 font-light text-[var(--text-soft)] truncate mb-1">{s.name}</p>
                <p className="t-9 tracking-display uppercase text-[var(--text-ghost)]">
                  PROB · {(s.probability * 100).toFixed(0)}%
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

    </div>
  );
}
