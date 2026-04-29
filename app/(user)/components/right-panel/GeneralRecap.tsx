"use client";

/**
 * GeneralRecap — Vue d'ensemble générale du thread/contexte actif.
 *
 * Récapitulatif condensé : assets récents, missions actives, status connecteurs,
 * et derniers événements importants. Premier onglet par défaut.
 */

import { useRuntimeStore } from "@/stores/runtime";
import type { RightPanelData } from "@/lib/core/types";
import { AssetGlyphSVG } from "../right-panel-helpers";

interface GeneralRecapProps {
  assets: RightPanelData["assets"];
  missions: RightPanelData["missions"];
  reportSuggestions?: RightPanelData["reportSuggestions"];
  loading: boolean;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="t-9 font-mono uppercase text-[var(--text-faint)]"
      style={{ letterSpacing: "0.22em", paddingBottom: "var(--space-2)" }}
    >
      {children}
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div
      className="t-11 text-[var(--text-ghost)]"
      style={{ padding: "var(--space-2) 0" }}
    >
      {label}
    </div>
  );
}

export function GeneralRecap({ assets, missions, reportSuggestions, loading }: GeneralRecapProps) {
  const events = useRuntimeStore((s) => s.events);
  const coreState = useRuntimeStore((s) => s.coreState);

  // Assets récents (3 derniers)
  const recentAssets = assets.slice(0, 3);

  // Missions actives/en cours
  const activeMissions = missions.filter((m) => m.opsStatus === "running" || m.enabled);

  // Derniers events importants (hors asset_generated)
  const importantEvents = events
    .filter((e) => ["approval_requested", "run_failed", "email_received", "message_received"].includes(e.type))
    .slice(0, 2);

  // Stats rapides
  const stats = [
    { label: "Assets", value: assets.length },
    { label: "Missions", value: missions.length },
    { label: "Actives", value: activeMissions.length },
    { label: "Events", value: events.length },
  ];

  if (loading) {
    return (
      <div style={{ padding: "var(--space-3)" }}>
        <div className="animate-pulse space-y-3">
          <div style={{ background: "var(--surface-1)", height: "60px", borderRadius: "var(--radius-xs)" }} />
          <div style={{ background: "var(--surface-1)", height: "40px", borderRadius: "var(--radius-xs)" }} />
          <div style={{ background: "var(--surface-1)", height: "40px", borderRadius: "var(--radius-xs)" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ padding: "var(--space-3)", gap: "var(--space-4)" }}>
      {/* Status strip */}
      <div
        className="flex items-center gap-3"
        style={{
          padding: "var(--space-3)",
          background: "var(--surface-1)",
          borderLeft: "2px solid var(--cykan)",
        }}
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{
            background: coreState === "running" ? "var(--cykan)" : coreState === "error" ? "var(--danger)" : "var(--text-faint)",
            boxShadow: coreState === "running" ? "0 0 8px var(--cykan)" : "none",
          }}
        />
        <span className="t-11 text-[var(--text-soft)]">
          {coreState === "running" ? "Agents actifs" : coreState === "error" ? "Erreur détectée" : "Système en veille"}
        </span>
      </div>

      {/* Quick stats grid */}
      <div className="grid grid-cols-4 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center"
            style={{
              padding: "var(--space-2)",
              background: "var(--card-flat-bg)",
              border: "1px solid var(--card-flat-border)",
            }}
          >
            <span className="t-15 font-bold text-[var(--cykan)]">{s.value}</span>
            <span className="t-9 font-mono uppercase text-[var(--text-faint)]">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Suggestions en attente */}
      {reportSuggestions && reportSuggestions.length > 0 && (
        <div>
          <SectionTitle>Suggestions ({reportSuggestions.length})</SectionTitle>
          <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            {reportSuggestions.slice(0, 2).map((s) => (
              <div
                key={s.specId}
                className="flex items-center justify-between"
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  background: "var(--card-flat-bg)",
                  borderLeft: "2px solid var(--cykan)",
                }}
              >
                <span className="t-11 text-[var(--text-soft)] truncate">{s.title}</span>
                <span
                  className="t-9 font-mono"
                  style={{ color: s.status === "ready" ? "var(--cykan)" : "var(--text-faint)" }}
                >
                  {s.status === "ready" ? "prêt" : "partiel"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assets récents */}
      <div>
        <SectionTitle>Assets récents</SectionTitle>
        {recentAssets.length === 0 ? (
          <EmptyRow label="Aucun asset généré" />
        ) : (
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
        )}
      </div>

      {/* Missions actives */}
      <div>
        <SectionTitle>Missions actives</SectionTitle>
        {activeMissions.length === 0 ? (
          <EmptyRow label="Aucune mission active" />
        ) : (
          <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            {activeMissions.slice(0, 2).map((m) => (
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
        )}
      </div>

      {/* Derniers events importants */}
      {importantEvents.length > 0 && (
        <div>
          <SectionTitle>Alertes récentes</SectionTitle>
          <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            {importantEvents.map((e, idx) => (
              <div
                key={`${e.timestamp}-${idx}`}
                className="flex items-center gap-2"
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  background: "var(--card-flat-bg)",
                  borderLeft: `2px solid ${
                    e.type === "approval_requested" ? "var(--warn)" : e.type === "run_failed" ? "var(--danger)" : "var(--cykan)"
                  }`,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: e.type === "approval_requested" ? "var(--warn)" : e.type === "run_failed" ? "var(--danger)" : "var(--cykan)",
                  }}
                />
                <span className="t-11 text-[var(--text-soft)] truncate flex-1">
                  {e.title || e.type.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
