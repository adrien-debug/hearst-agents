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
import { useNavigationStore } from "@/stores/navigation";
import { voiceToolDefs, VOICE_TOOL_LABELS } from "@/lib/voice/tool-defs";
import { ProviderChip } from "./ProviderChip";
import { useRightPanelData } from "./right-panel/useRightPanelData";
import { GeneralDashboard } from "./right-panel/GeneralDashboard";
import { ContextRailForMission } from "./ContextRailForMission";

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
    case "mission":
      return (
        <ContextRailShell onClose={onClose}>
          <ContextRailForMission />
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
            aria-label="Close"
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
  const router = useRouter();
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const {
    assets,
    missions,
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
          Aucune suggestion.
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
  const { variants, assetTitle, assetSummary, assetCreatedAt, assetKind } =
    useStageData((s) => s.asset);
  const readyVariants = variants.filter((v) => v.status === "ready");
  const imageVariant = readyVariants.find((v) => v.kind === "image");
  const isImageOnly = !!imageVariant;

  const fmtDate = (ts?: number) => {
    if (!ts) return null;
    try {
      return new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Paris",
      }).format(new Date(ts));
    } catch {
      return null;
    }
  };

  const variantMeta = (imageVariant?.metadata ?? {}) as {
    width?: number;
    height?: number;
    model?: string;
  };

  return (
    <div className="h-full overflow-y-auto">
      <Section label="Title">
        <p
          className="t-13 font-light text-[var(--text)]"
          style={{ lineHeight: "var(--leading-snug)" }}
        >
          {assetTitle || "—"}
        </p>
      </Section>

      {assetSummary && (
        <Section label="Prompt">
          <p
            className="t-11 font-light text-[var(--text-muted)]"
            style={{ lineHeight: "var(--leading-relaxed)" }}
          >
            {assetSummary}
          </p>
        </Section>
      )}

      {assetCreatedAt && (
        <Section label="Created">
          <p className="t-11 font-mono text-[var(--text-faint)]">
            {fmtDate(assetCreatedAt)}
          </p>
        </Section>
      )}

      {assetKind && (
        <Section label="Type">
          <p className="t-9 font-mono uppercase tracking-display text-[var(--cykan)]">
            {assetKind}
          </p>
        </Section>
      )}

      {isImageOnly && imageVariant && (
        <Section label="Image details">
          <ul className="flex flex-col gap-2">
            {variantMeta.width && variantMeta.height && (
              <li className="flex items-baseline gap-3">
                <span className="t-9 font-mono uppercase tracking-display text-[var(--text-faint)]">
                  Dimensions
                </span>
                <span className="t-11 font-mono text-[var(--text-muted)]">
                  {variantMeta.width}×{variantMeta.height}
                </span>
              </li>
            )}
            {variantMeta.model && (
              <li className="flex items-baseline gap-3">
                <span className="t-9 font-mono uppercase tracking-display text-[var(--text-faint)]">
                  Model
                </span>
                <span className="t-11 font-mono text-[var(--text-muted)] truncate">
                  {variantMeta.model}
                </span>
              </li>
            )}
            {imageVariant.provider && (
              <li className="flex items-baseline gap-3">
                <span className="t-9 font-mono uppercase tracking-display text-[var(--text-faint)]">
                  Provider
                </span>
                <span className="t-11 font-mono text-[var(--text-muted)] uppercase">
                  {imageVariant.provider}
                </span>
              </li>
            )}
          </ul>
        </Section>
      )}

      {!isImageOnly && (
        <Section label="Variants" count={readyVariants.length}>
          {readyVariants.length === 0 ? (
            <EmptyHint>
              Text only — generate audio/video/code via the tabs
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
      )}
    </div>
  );
}

function ContextRailForBrowser() {
  return (
    <div className="h-full overflow-y-auto">


      <Section label="Co-pilot">
        <p className="t-13 font-light text-[var(--text-faint)] leading-relaxed">
          Agent navigating in the live session. Take Over coming with
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
            {status ? "Analysis running…" : "Waiting for transcript"}
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

      <Section label="Mission templates">
        <p className="t-13 font-light text-[var(--text-faint)] leading-relaxed">
          Approve all → Composio execution (Slack, Linear, Notion, Gmail).
        </p>
      </Section>
    </div>
  );
}

function ContextRailForKnowledge() {
  const { graph, selectedNode } = useStageData((s) => s.kg);
  return (
    <div className="h-full overflow-y-auto">
      <Section label="Focus entity">
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
          <EmptyHint>Click a graph node</EmptyHint>
        )}
      </Section>
      <Section label="Graph" count={graph.nodes.length}>
        <p className="t-10 tracking-body uppercase text-[var(--text-ghost)] font-light">
          {graph.nodes.length} entities · {graph.edges.length} relations
        </p>
      </Section>

    </div>
  );
}

function ContextRailForVoice() {
  const transcript = useVoiceStore((s) => s.transcript);
  const phase = useVoiceStore((s) => s.phase);
  const sessionId = useVoiceStore((s) => s.sessionId);
  const services = useServicesStore((s) => s.services);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const connectedApps = services.filter((s) => s.connectionStatus === "connected");
  const last10 = transcript.slice(-10);
  const totalToolsCount = voiceToolDefs.length + connectedApps.length;
  const toolCallCount = transcript.filter(
    (e) => e.role === "tool_call" || e.role === "tool_result",
  ).length;

  const handleLinkThread = async () => {
    if (!sessionId || !activeThreadId) return;
    try {
      await fetch(`/api/v2/voice/transcripts/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ threadId: activeThreadId }),
      });
    } catch {
      // Silent — le link est best-effort
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <Section label="Live transcript" count={transcript.length}>
        {transcript.length === 0 ? (
          <EmptyHint>
            {phase === "idle"
              ? "Activate voice mode to start"
              : "Waiting for first exchange"}
          </EmptyHint>
        ) : (
          <ul className="flex flex-col gap-4">
            {last10.map((entry) => {
              if (entry.role === "tool_call") {
                return (
                  <li key={entry.id} className="flex flex-col gap-1.5">
                    <span className="t-9 tracking-display uppercase text-[var(--warn)]">
                      TOOL CALL
                    </span>
                    <div className="flex items-center gap-2">
                      <ProviderChip
                        providerId={entry.providerId ?? "composio"}
                        label={entry.toolName ?? entry.text}
                        status={entry.status ?? "pending"}
                      />
                    </div>
                  </li>
                );
              }
              if (entry.role === "tool_result") {
                return (
                  <li key={entry.id} className="flex flex-col gap-1.5">
                    <span
                      className={`t-9 tracking-display uppercase ${
                        entry.status === "error"
                          ? "text-[var(--danger)]"
                          : "text-[var(--cykan)]"
                      }`}
                    >
                      {entry.status === "error" ? "TOOL ERROR" : "TOOL RESULT"}
                    </span>
                    <p className="t-11 font-light text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                      {entry.text}
                    </p>
                  </li>
                );
              }
              return (
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
              );
            })}
          </ul>
        )}
        {sessionId && transcript.length > 0 && activeThreadId && (
          <button
            type="button"
            onClick={handleLinkThread}
            className="mt-4 t-9 tracking-display uppercase text-[var(--cykan)] hover:text-[var(--text)] transition-colors"
          >
            Lier au thread →
          </button>
        )}
      </Section>
      <Section label="Tool receipts" count={toolCallCount}>
        {toolCallCount === 0 ? (
          <EmptyHint>No tool calls yet</EmptyHint>
        ) : (
          <p className="t-10 tracking-body uppercase text-[var(--text-ghost)] font-light leading-relaxed">
            {transcript
              .filter((e) => e.role === "tool_call")
              .slice(-5)
              .map((e) => e.toolName ?? e.text)
              .join(" · ")}
          </p>
        )}
      </Section>
      <Section label="Available tools" count={totalToolsCount}>
        <p className="t-10 tracking-body uppercase text-[var(--text-ghost)] font-light leading-relaxed">
          {[
            ...voiceToolDefs.map((t) => VOICE_TOOL_LABELS[t.name] ?? t.name),
            ...connectedApps.map((a) => a.name),
          ].join(" · ")}
        </p>
      </Section>
      <Section label="Voice settings">
        <p className="t-13 font-light text-[var(--text-faint)] leading-relaxed">
          Model{" "}
          <span className="text-[var(--cykan)]">openai-realtime</span>, target
          latency &lt; 500&nbsp;ms.
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
          <EmptyHint>Define inputs in the form</EmptyHint>
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
      <Section label="Generated scenarios" count={scenarios.length}>
        {scenarios.length === 0 ? (
          <EmptyHint>
            {phase === "running" ? "DeepSeek thinking…" : "No scenarios"}
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
