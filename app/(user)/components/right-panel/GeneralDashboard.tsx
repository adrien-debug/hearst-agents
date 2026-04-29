"use client";

/**
 * GeneralDashboard — Vue d'accueil par défaut du RightPanel.
 *
 * Structure FIXE : 4 sections toujours rendues (Suggestions / Missions /
 * Livrables / Alertes). Vide → empty state interne, jamais de bloc escamoté.
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
  runningSpecs: Set<string>;
  onRunSuggestion: (specId: string, title: string) => Promise<void>;
}

function SectionTitle({
  children,
  count,
  action,
}: {
  children: React.ReactNode;
  count?: number;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] inline-flex items-baseline gap-2">
        <span>{children}</span>
        {typeof count === "number" && (
          <span className="t-9 font-mono tracking-display text-[var(--text-ghost)]">
            {count.toString().padStart(2, "0")}
          </span>
        )}
      </span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="t-9 font-mono uppercase tracking-section text-[var(--cykan)] hover:underline"
        >
          {action.label} →
        </button>
      )}
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center"
      style={{
        padding: "var(--space-3)",
        background: "var(--card-flat-bg)",
        border: "1px dashed var(--card-flat-border)",
      }}
    >
      <span className="t-11 font-mono uppercase tracking-display text-[var(--text-ghost)]">
        {children}
      </span>
    </div>
  );
}

function SkeletonRow({ height = 60 }: { height?: number }) {
  return (
    <div
      className="animate-pulse"
      style={{
        height: `${height}px`,
        background: "var(--surface-1)",
        borderRadius: "var(--radius-xs)",
      }}
    />
  );
}

function SuggestionRow({
  suggestion,
  onRun,
  isRunning,
}: {
  suggestion: NonNullable<RightPanelData["reportSuggestions"]>[number];
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
        className="t-9 font-mono uppercase tracking-section ml-3 shrink-0"
        style={{
          color: suggestion.status === "ready" ? "var(--cykan)" : "var(--text-faint)",
        }}
      >
        {isRunning
          ? "..."
          : suggestion.status === "ready"
            ? "lancer"
            : `${suggestion.requiredApps.length - suggestion.missingApps.length}/${suggestion.requiredApps.length}`}
      </span>
    </button>
  );
}

export function GeneralDashboard({
  assets,
  missions,
  reportSuggestions,
  onViewChange,
  activeThreadId: _activeThreadId,
  loading,
  runningSpecs,
  onRunSuggestion,
}: GeneralDashboardProps) {
  const events = useRuntimeStore((s) => s.events);
  const visibleSuggestions = (reportSuggestions ?? []).filter(
    (s) => !runningSpecs.has(s.specId),
  );

  const recentAssets = assets.slice(0, 3);
  const activeMissions = missions
    .filter((m) => m.opsStatus === "running" || m.enabled)
    .slice(0, 2);
  const alerts = events
    .filter((e) => ["approval_requested", "run_failed", "email_received"].includes(e.type))
    .slice(0, 2);

  return (
    <div
      className="flex flex-col"
      style={{ padding: "var(--space-3)", gap: "var(--space-4)" }}
    >
      {/* Section 1 — Suggestions */}
      <section>
        <SectionTitle
          count={visibleSuggestions.length}
          action={{ label: "Tous", onClick: () => onViewChange("reports") }}
        >
          Suggestions
        </SectionTitle>
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          {loading && visibleSuggestions.length === 0 ? (
            <SkeletonRow height={64} />
          ) : visibleSuggestions.length === 0 ? (
            <EmptyRow>Aucune suggestion disponible.</EmptyRow>
          ) : (
            visibleSuggestions.slice(0, 2).map((s) => (
              <SuggestionRow
                key={s.specId}
                suggestion={s}
                onRun={() => onRunSuggestion(s.specId, s.title)}
                isRunning={runningSpecs.has(s.specId)}
              />
            ))
          )}
        </div>
      </section>

      {/* Section 2 — Missions actives */}
      <section>
        <SectionTitle
          count={activeMissions.length}
          action={{ label: "Toutes", onClick: () => onViewChange("missions") }}
        >
          Missions actives
        </SectionTitle>
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          {loading && activeMissions.length === 0 ? (
            <SkeletonRow height={40} />
          ) : activeMissions.length === 0 ? (
            <EmptyRow>Aucune mission armée.</EmptyRow>
          ) : (
            activeMissions.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between"
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  background: "var(--card-flat-bg)",
                  borderLeft:
                    m.opsStatus === "running"
                      ? "2px solid var(--cykan)"
                      : "2px solid var(--text-faint)",
                }}
              >
                <span className="t-11 text-[var(--text-soft)] truncate">{m.name}</span>
                <span
                  className="t-9 font-mono uppercase tracking-section"
                  style={{
                    color: m.opsStatus === "running" ? "var(--cykan)" : "var(--text-faint)",
                  }}
                >
                  {m.opsStatus === "running" ? "running" : "armé"}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Section 3 — Derniers livrables */}
      <section>
        <SectionTitle
          count={recentAssets.length}
          action={{ label: "Tous", onClick: () => onViewChange("assets") }}
        >
          Derniers livrables
        </SectionTitle>
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          {loading && recentAssets.length === 0 ? (
            <SkeletonRow height={40} />
          ) : recentAssets.length === 0 ? (
            <EmptyRow>Aucun livrable produit.</EmptyRow>
          ) : (
            recentAssets.map((a) => (
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
                <span
                  className="t-9 font-mono uppercase tracking-section text-[var(--text-faint)]"
                >
                  {a.type}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Section 4 — Alertes */}
      <section>
        <SectionTitle count={alerts.length}>Alertes</SectionTitle>
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          {alerts.length === 0 ? (
            <EmptyRow>Aucune alerte récente.</EmptyRow>
          ) : (
            alerts.map((alert, idx) => {
              const accent =
                alert.type === "approval_requested"
                  ? "var(--warn)"
                  : alert.type === "run_failed"
                    ? "var(--danger)"
                    : "var(--cykan)";
              return (
                <div
                  key={`${alert.timestamp}-${idx}`}
                  className="flex items-center gap-2"
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    background: "var(--card-flat-bg)",
                    borderLeft: `2px solid ${accent}`,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-pill"
                    style={{ background: accent }}
                  />
                  <span className="t-11 text-[var(--text-soft)] truncate flex-1">
                    {(alert.title as string) || alert.type.replace(/_/g, " ")}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
