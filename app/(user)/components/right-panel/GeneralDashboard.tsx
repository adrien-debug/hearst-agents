"use client";

/**
 * GeneralDashboard — rail droit cockpit/chat (cleanup 2026-05-03 v2).
 *
 * 4 modules sémantiques empilés (le bloc KPI 3-col Assets/Missions/Reports
 * a été déplacé au centre dans <KPIStrip> — anti-doublon, vue d'ensemble
 * dans le Stage, contextualisation dans le rail).
 *
 *   ① Maintenant     coreState live + heure + 1 session active si présente
 *   ② Aujourd'hui    Brief + prochain meeting + inbox count (CockpitTodayPayload)
 *   ③ Activité       3 derniers events significatifs (assets + missions runs)
 *   ④ Suggestion     1 heuristique client (brief non lu, mission échouée)
 *
 * Aucune mention de coût/budget/argent — pivot 2026-05-03, l'utilisateur
 * ne veut pas de friction financière dans le flow cockpit.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useRuntimeStore } from "@/stores/runtime";
import { useStageStore } from "@/stores/stage";
import { useVoiceStore } from "@/stores/voice";
import type { CockpitTodayPayload } from "@/lib/cockpit/today";

interface GeneralDashboardProps {
  assets?: unknown;
  missions?: unknown;
  onViewChange?: (view: "reports" | "missions" | "assets") => void;
  activeThreadId?: string | null;
  loading?: boolean;
}

interface DashboardAsset {
  id: string;
  name?: string;
  title?: string;
  type?: string;
  createdAt?: number;
  created_at?: string;
}

interface DashboardMission {
  id: string;
  name: string;
  enabled?: boolean;
  opsStatus?: "idle" | "running" | "success" | "failed" | "blocked";
  lastRunAt?: number;
}

// ── State labels ───────────────────────────────────────────

const CORE_STATE_LABEL: Record<string, string> = {
  idle: "En ligne",
  connecting: "Connexion",
  streaming: "En cours",
  processing: "Traitement",
  error: "Erreur",
  awaiting_approval: "Approbation requise",
  awaiting_clarification: "Précision requise",
};

export function GeneralDashboard({
  assets: _assets,
  missions: _missions,
  onViewChange = () => {},
}: GeneralDashboardProps) {
  // onViewChange : préservé dans l'API (callers ContextRail le passent encore),
  // plus utilisé localement depuis le retrait du bloc KPI 3-col.
  void onViewChange;
  const coreState = useRuntimeStore((s) => s.coreState);
  const stageMode = useStageStore((s) => s.current.mode);
  const voiceActive = useVoiceStore((s) => s.voiceActive);

  // ── Counts (utilisés uniquement pour activeMissions désormais —
  // le bloc KPI 3-col Assets/Missions/Reports a migré au centre du
  // Cockpit dans <KPIStrip> pour éviter le doublon visuel). ────────
  const activeMissions = Array.isArray(_missions) ? (_missions as DashboardMission[]) : [];
  const runningMissions = activeMissions.filter((m) => m.opsStatus === "running");
  const failedMissions = activeMissions.filter((m) => m.opsStatus === "failed");

  // ── Cockpit today (briefing + agenda + inbox) ─────────────
  // Fetch léger au mount, échec silencieux. Si non dispo, le module
  // "Aujourd'hui" affiche un empty state honnête.
  const [today, setToday] = useState<CockpitTodayPayload | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/v2/cockpit/today", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CockpitTodayPayload | null) => {
        if (!cancelled && data) setToday(data);
      })
      .catch(() => {
        // Fail-soft : module masqué si fetch échoue.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Live clock ────────────────────────────────────────────
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const timeLabel = now
    ? now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : "--:--";

  // ── Now session ───────────────────────────────────────────
  const activeSession =
    voiceActive
      ? { kind: "voice" as const, label: "Session vocale" }
      : stageMode === "browser"
        ? { kind: "browser" as const, label: "Browser session" }
        : stageMode === "meeting"
          ? { kind: "meeting" as const, label: "Meeting en cours" }
          : runningMissions[0]
            ? { kind: "mission" as const, label: runningMissions[0].name }
            : null;

  // ── Today bits ────────────────────────────────────────────
  const briefing = today?.briefing;
  const briefStatus = briefing
    ? briefing.empty
      ? "non-généré"
      : briefing.body
        ? "prêt"
        : "vide"
    : null;
  const briefTimeLabel =
    today && !briefing?.empty
      ? new Date(today.generatedAt).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  const nextAgenda = today?.agenda?.[0];

  const inboxCount = today?.inbox?.brief?.items?.length ?? 0;
  const inboxConnected = today && !today.inbox.needsConnection;

  // ── Activité récente ──────────────────────────────────────
  const recentAssets = Array.isArray(_assets)
    ? (_assets as DashboardAsset[]).slice(0, 2)
    : [];
  const lastRunMission = [...activeMissions]
    .filter((m) => m.lastRunAt)
    .sort((a, b) => (b.lastRunAt ?? 0) - (a.lastRunAt ?? 0))[0];

  type ActivityItem = {
    id: string;
    icon: ReactNode;
    label: string;
    meta: string;
  };
  const activityItems: ActivityItem[] = [];
  for (const a of recentAssets) {
    activityItems.push({
      id: `a-${a.id}`,
      icon: <BulletDot tone="cykan" />,
      label: a.name ?? a.title ?? "Asset",
      meta: `${a.type ?? "asset"} · ${formatRelative(parseAssetTs(a))}`,
    });
  }
  if (lastRunMission) {
    activityItems.push({
      id: `m-${lastRunMission.id}`,
      icon: <BulletDot tone={lastRunMission.opsStatus === "failed" ? "danger" : "neutral"} />,
      label: lastRunMission.name,
      meta: `${lastRunMission.opsStatus === "failed" ? "échec" : "réussi"} · ${formatRelative(lastRunMission.lastRunAt)}`,
    });
  }

  // ── Suggestion (heuristique client) ───────────────────────
  const suggestion = computeSuggestion({
    failedCount: failedMissions.length,
    briefStale:
      today != null && (today.inbox?.stale ?? false) && !today.inbox.needsConnection,
    inboxNeedsConnection: today?.inbox?.needsConnection === true,
  });

  // ──────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col"
      style={{ padding: "var(--space-8) var(--space-5)", gap: "var(--space-6)" }}
    >
      {/* ① Maintenant */}
      <DashboardSection label="Maintenant">
        <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
          <BulletDot tone="cykan" pulse={coreState !== "idle"} />
          <span className="t-13 font-light" style={{ color: "var(--text-soft)" }}>
            {CORE_STATE_LABEL[coreState] ?? "En ligne"}
          </span>
          <span className="t-11 font-mono tabular-nums ml-auto" style={{ color: "var(--text-faint)" }}>
            {timeLabel}
          </span>
        </div>
        {activeSession ? (
          <div
            className="flex items-baseline"
            style={{ gap: "var(--space-3)", marginTop: "var(--space-2)" }}
          >
            <span className="t-11 font-light" style={{ color: "var(--text-faint)", textTransform: "lowercase" }}>
              {sessionKindLabel(activeSession.kind)}
            </span>
            <span className="t-13 font-light truncate" style={{ color: "var(--text-l2)" }}>
              {activeSession.label}
            </span>
          </div>
        ) : (
          <p
            className="t-11 font-light"
            style={{ color: "var(--text-faint)", marginTop: "var(--space-2)" }}
          >
            Aucune session active
          </p>
        )}
      </DashboardSection>

      {/* ② Aujourd'hui */}
      {today && (
        <DashboardSection label="Aujourd'hui">
          <ul className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            <DashboardRow
              label="Brief"
              value={
                briefStatus === "prêt"
                  ? `Lu · ${briefTimeLabel ?? ""}`
                  : briefStatus === "non-généré"
                    ? "Pas encore généré"
                    : "—"
              }
            />
            {nextAgenda && (
              <DashboardRow
                label="Prochain"
                value={`${nextAgenda.title} · ${formatAgendaTime(nextAgenda.startsAt)}`}
              />
            )}
            {inboxConnected && (
              <DashboardRow
                label="Inbox"
                value={
                  inboxCount > 0
                    ? `${inboxCount} signaux`
                    : "Tout est calme"
                }
              />
            )}
          </ul>
        </DashboardSection>
      )}

      {/* ③ Activité récente */}
      <DashboardSection label="Activité récente">
        {activityItems.length === 0 ? (
          <p className="t-11 font-light" style={{ color: "var(--text-faint)" }}>
            Rien encore — utilise le chat pour commencer
          </p>
        ) : (
          <ul className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            {activityItems.map((item) => (
              <li
                key={item.id}
                className="flex items-baseline"
                style={{ gap: "var(--space-3)" }}
              >
                <span className="shrink-0" style={{ alignSelf: "center" }}>
                  {item.icon}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="t-13 font-light truncate" style={{ color: "var(--text-l2)" }}>
                    {item.label}
                  </span>
                  <span className="t-9 font-light" style={{ color: "var(--text-faint)" }}>
                    {item.meta}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      {/* ④ Suggestion */}
      {suggestion && (
        <DashboardSection label="Suggestion">
          <button
            type="button"
            onClick={suggestion.onClick}
            className="flex items-baseline w-full text-left transition-colors group"
            style={{ gap: "var(--space-2)" }}
          >
            <span
              className="t-13 font-light flex-1 group-hover:text-[var(--text)]"
              style={{ color: "var(--text-l2)" }}
            >
              {suggestion.text}
            </span>
            <span
              className="t-13 font-mono shrink-0 group-hover:text-[var(--cykan)]"
              style={{ color: "var(--text-faint)" }}
              aria-hidden
            >
              →
            </span>
          </button>
        </DashboardSection>
      )}
    </div>
  );
}

// ── Sous-composants internes ──────────────────────────────

function DashboardSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col" style={{ gap: "var(--space-3)" }}>
      <header
        className="flex items-baseline"
        style={{
          paddingBottom: "var(--space-2)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <span className="t-11 font-medium" style={{ color: "var(--text-faint)" }}>
          {label}
        </span>
      </header>
      <div>{children}</div>
    </section>
  );
}

function DashboardRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline" style={{ gap: "var(--space-3)" }}>
      <span
        className="t-11 font-light shrink-0"
        style={{ color: "var(--text-faint)", minWidth: "var(--space-16)" }}
      >
        {label}
      </span>
      <span className="t-13 font-light truncate" style={{ color: "var(--text-l2)" }}>
        {value}
      </span>
    </li>
  );
}

function BulletDot({
  tone,
  pulse = false,
}: {
  tone: "cykan" | "danger" | "neutral";
  pulse?: boolean;
}) {
  const color =
    tone === "cykan"
      ? "var(--cykan)"
      : tone === "danger"
        ? "var(--danger)"
        : "var(--text-faint)";
  return (
    <span
      className={`rounded-pill shrink-0 ${pulse ? "animate-pulse" : ""}`}
      style={{
        width: "var(--space-2)",
        height: "var(--space-2)",
        background: color,
        boxShadow: tone === "cykan" ? "var(--shadow-neon-cykan)" : "none",
      }}
      aria-hidden
    />
  );
}

// ── Helpers ───────────────────────────────────────────────

function sessionKindLabel(kind: "voice" | "browser" | "meeting" | "mission"): string {
  switch (kind) {
    case "voice":
      return "voix";
    case "browser":
      return "browser";
    case "meeting":
      return "meeting";
    case "mission":
      return "mission";
  }
}

function parseAssetTs(a: DashboardAsset): number | undefined {
  if (typeof a.createdAt === "number") return a.createdAt;
  if (typeof a.created_at === "string") {
    const t = Date.parse(a.created_at);
    return Number.isFinite(t) ? t : undefined;
  }
  return undefined;
}

function formatRelative(ts?: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "à l'instant";
  if (diff < 3_600_000) {
    const m = Math.round(diff / 60_000);
    return `il y a ${m} min`;
  }
  if (diff < 86_400_000) {
    const h = Math.round(diff / 3_600_000);
    return `il y a ${h} h`;
  }
  const d = Math.round(diff / 86_400_000);
  if (d === 1) return "hier";
  if (d < 7) return `il y a ${d} j`;
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function formatAgendaTime(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  const diffH = (ts - Date.now()) / 3_600_000;
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (diffH < 0) return time;
  if (diffH < 1) return `dans ${Math.round(diffH * 60)} min`;
  if (diffH < 6) return `dans ${Math.round(diffH)} h`;
  return time;
}

function computeSuggestion({
  failedCount,
  briefStale,
  inboxNeedsConnection,
}: {
  failedCount: number;
  briefStale: boolean;
  inboxNeedsConnection: boolean;
}): { text: string; onClick: () => void } | null {
  if (failedCount > 0) {
    return {
      text: `${failedCount} mission${failedCount > 1 ? "s" : ""} en échec — voir les détails`,
      onClick: () => {
        if (typeof window !== "undefined") window.location.href = "/missions";
      },
    };
  }
  if (briefStale) {
    return {
      text: "Brief inbox plus vieux qu'1h — rafraîchir",
      onClick: () => {
        if (typeof window !== "undefined") window.location.href = "/briefing";
      },
    };
  }
  if (inboxNeedsConnection) {
    return {
      text: "Connecte Gmail ou Slack pour activer ton inbox",
      onClick: () => {
        if (typeof window !== "undefined") window.location.href = "/apps";
      },
    };
  }
  return null;
}
