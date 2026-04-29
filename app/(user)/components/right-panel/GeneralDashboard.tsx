"use client";

/**
 * GeneralDashboard — Vue d'accueil par défaut du RightPanel.
 *
 * Dashboard résumé montrant :
 * - Suggestions de rapports prioritaires (action principale)
 * - Missions actives (aperçu)
 * - Derniers livrables (aperçu)
 * - Alertes récentes si urgent
 */

import type { RightPanelData } from "@/lib/core/types";
import { useRuntimeStore } from "@/stores/runtime";
import { AssetGlyphSVG } from "../right-panel-helpers";

interface GeneralDashboardProps {
  assets: RightPanelData["assets"];
  missions: RightPanelData["missions"];
  reportSuggestions?: RightPanelData["reportSuggestions"];
  onViewChange: (view: "reports" | "missions" | "assets") => void;
  activeThreadId: string | null;
  loading: boolean;
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span
        className="t-9 font-mono uppercase text-[var(--text-faint)]"
        style={{ letterSpacing: "0.22em" }}
      >
        {children}
      </span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="t-9 font-mono text-[var(--cykan)] hover:underline"
        >
          {action.label} →
        </button>
      )}
    </div>
  );
}

function SuggestionRow({
  suggestion,
  onRun,
  isRunning,
}: {
  suggestion: RightPanelData["reportSuggestions"][number];
  onRun: () => void;
  isRunning: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onRun}
      disabled={isRunning}
      className="w-full text-left flex items-center justify-between"
      style={{
        padding: "var(--space-3)",
        background: "var(--card-flat-bg)",
        border: "1px solid var(--card-flat-border)",
        borderLeft: "2px solid var(--cykan)",
      }}
    >
      <div className="flex-1 min-w-0">
        <p className="t-13 font-medium text-[var(--text-soft)] truncate">{suggestion.title}</p>
        <p className="t-9 text-[var(--text-faint)] truncate mt-0.5">{suggestion.description}</p>
      </div>
      <span
        className="t-9 font-mono uppercase ml-3 shrink-0"
        style={{
          color: suggestion.status === "ready" ? "var(--cykan)" : "var(--text-faint)",
        }}
      >
        {isRunning ? "..." : suggestion.status === "ready" ? "LANCER" : `${suggestion.requiredApps.length - suggestion.missingApps.length}/${suggestion.requiredApps.length}`}
      </span>
    </button>
  );
}

export function GeneralDashboard({
  assets,
  missions,
  reportSuggestions,
  onViewChange,
  activeThreadId,
  loading,
}: GeneralDashboardProps) {
  const events = useRuntimeStore((s) => s.events);

  // Assets récents (3 derniers)
  const recentAssets = assets.slice(0, 3);

  // Missions actives/running (2 max)
  const activeMissions = missions.filter((m) => m.opsStatus === "running" || m.enabled).slice(0, 2);

  // Alertes importantes
  const alerts = events
    .filter((e) => ["approval_requested", "run_failed", "email_received"].includes(e.type))
    .slice(0, 2);

  if (loading) {
    return (
      <div style={{ padding: "var(--space-3)" }} className="animate-pulse space-y-4">
        <div style={{ height: "80px", background: "var(--surface-1)", borderRadius: "var(--radius-xs)" }} />
        <div style={{ height: "60px", background: "var(--surface-1)", borderRadius: "var(--radius-xs)" }} />
        <div style={{ height: "60px", background: "var(--surface-1)", borderRadius: "var(--radius-xs)" }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ padding: "var(--space-3)", gap: "var(--space-4)" }}>
      {/* Suggestions prioritaires */}
      {reportSuggestions && reportSuggestions.length > 0 && (
        <div>
          <SectionTitle action={{ label: "Tous", onClick: () => onViewChange("reports") }}>
            Suggestions ({reportSuggestions.length})
          </SectionTitle>
          <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            {reportSuggestions.slice(0, 2).map((s) => (
              <SuggestionRow
                key={s.specId}
                suggestion={s}
                onRun={() => {/* TODO: handle run */}}
                isRunning={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Missions actives preview */}
      {activeMissions.length > 0 && (
        <div>
          <SectionTitle action={{ label: "Toutes", onClick: () => onViewChange("missions") }}>
            Missions actives ({activeMissions.length})
          </SectionTitle>
          <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            {activeMissions.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between"
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  background: "var(--card-flat-bg)",
                  borderLeft: m.opsStatus === "running" ? "2px solid var(--cykan)" : "2px solid var(--text-faint)",
                }}
              >
                <span className="t-11 text-[var(--text-soft)] truncate">{m.name}</span>
                <span
                  className="t-9 font-mono uppercase"
                  style={{ color: m.opsStatus === "running" ? "var(--cykan)" : "var(--text-faint)" }}
                >
                  {m.opsStatus === "running" ? "running" : "armé"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Derniers livrables */}
      {recentAssets.length > 0 && (
        <div>
          <SectionTitle action={{ label: "Tous", onClick: () => onViewChange("assets") }}>
            Derniers livrables
          </SectionTitle>
          <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            {recentAssets.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3"
                style={{
                  padding: "var(--space-2)",
                  background: "var(--card-flat-bg)",
                }}
              >
                <span className="w-5 h-5 text-[var(--text-muted)]">
                  <AssetGlyphSVG type={a.type} />
                </span>
                <span className="t-11 text-[var(--text-soft)] truncate flex-1">{a.name}</span>
                <span className="t-9 font-mono uppercase text-[var(--text-faint)]">{a.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alertes récentes */}
      {alerts.length > 0 && (
        <div>
          <SectionTitle>Alertes</SectionTitle>
          <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            {alerts.map((alert, idx) => (
              <div
                key={`${alert.timestamp}-${idx}`}
                className="flex items-center gap-2"
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  background: "var(--card-flat-bg)",
                  borderLeft: `2px solid ${
                    alert.type === "approval_requested"
                      ? "var(--warn)"
                      : alert.type === "run_failed"
                        ? "var(--danger)"
                        : "var(--cykan)"
                  }`,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background:
                      alert.type === "approval_requested"
                        ? "var(--warn)"
                        : alert.type === "run_failed"
                          ? "var(--danger)"
                          : "var(--cykan)",
                  }}
                />
                <span className="t-11 text-[var(--text-soft)] truncate flex-1">
                  {(alert.title as string) || alert.type.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
