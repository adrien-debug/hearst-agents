"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { CockpitTodayPayload } from "@/lib/cockpit/today";
import { toast } from "@/app/hooks/use-toast";

interface CockpitPosterProps {
  data: CockpitTodayPayload;
  onBriefRefreshed?: () => void;
}

export function CockpitPoster({ data, onBriefRefreshed }: CockpitPosterProps) {
  const { data: session } = useSession();
  const [now, setNow] = useState<Date | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const firstName = useMemo(() => extractFirstName(session?.user?.name, session?.user?.email), [session]);
  const dateParts = useMemo(() => formatDate(now), [now]);

  const assetsTotal = data.counts.assets;
  const missionsTotal = data.counts.missions;
  const reportsTotal = data.counts.reports;

  const observation = useMemo(() => computeObservation(data), [data]);
  const briefReady = !data.briefing.empty && Boolean(data.briefing.body);
  const briefIncipit = useMemo(
    () => (briefReady ? truncate(stripMarkdown(data.briefing.body ?? ""), 280) : null),
    [briefReady, data.briefing.body],
  );

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/briefing", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Brief généré", "Ton brief du jour est prêt.");
      onBriefRefreshed?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur";
      toast.error("Impossible de générer le brief", msg);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div
      className="flex-1 flex flex-col min-h-0 overflow-hidden"
      style={{
        width: "100%",
        maxWidth: "var(--width-poster-body)",
        marginInline: "auto",
        padding: "var(--space-6) var(--space-12) var(--space-4)",
      }}
    >
      {/* ─── ZONE A : Header ──────────────────────────────────────── */}
      <header className="flex-none flex flex-col" style={{ gap: "var(--space-3)" }}>
        <span className="poster-eyebrow">Hearst · Cockpit</span>
        <div
          className="grid"
          style={{
            gridTemplateColumns: "auto 1fr",
            gap: "var(--space-10)",
            alignItems: "start",
          }}
        >
          {/* Col gauche : date + time-tick */}
          <div className="flex flex-col" style={{ gap: "var(--space-1)" }}>
            <span className="poster-display is-display-l" style={{ color: "var(--text)" }}>
              {dateParts.weekday}
            </span>
            <span className="poster-display is-display-m" style={{ color: "var(--text-muted)" }}>
              {dateParts.dayMonth}
            </span>
            <div className="poster-time-tick" style={{ marginTop: "var(--space-2)" }}>
              <span className="poster-pulse" aria-hidden />
              <span>{dateParts.time ?? "--:--:--"}</span>
              <span style={{ color: "var(--text-decor-25)" }}>·</span>
              <span>Système éveillé</span>
            </div>
          </div>

          {/* Col droite : greeting + 3 KPI tiles + observation/hospitality */}
          <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
            <h1 className="poster-greeting" style={{ color: "var(--text)" }}>
              Bonjour {firstName}.
            </h1>
            <div className="flex" style={{ gap: "var(--space-8)" }}>
              <button type="button" className="kpi-tile">
                <span className="kpi-num">{pad2(assetsTotal)}</span>
                <span className="kpi-label">assets</span>
              </button>
              <button type="button" className="kpi-tile">
                <span className="kpi-num">{pad2(missionsTotal)}</span>
                <span className="kpi-label">missions</span>
              </button>
              <button type="button" className="kpi-tile">
                <span className="kpi-num">{pad2(reportsTotal)}</span>
                <span className="kpi-label">reports</span>
              </button>
            </div>
            {observation && (
              <aside className="poster-observation" style={{ maxWidth: "var(--width-prose-narrow)" }}>
                {observation}
              </aside>
            )}
            {data.hospitality && (
              <aside
                className="poster-observation"
                style={{
                  maxWidth: "var(--width-prose)",
                  borderLeftColor: "var(--gold)",
                  color: "var(--text)",
                }}
              >
                <span
                  className="poster-eyebrow"
                  style={{ color: "var(--gold)", display: "block", marginBottom: "var(--space-2)" }}
                >
                  Hôtel · {data.hospitality.source === "demo" ? "Données de démo" : "Live"}
                </span>
                <span>
                  <strong style={{ fontWeight: 600 }}>{data.hospitality.occupancy}%</strong> occupé.
                  {" "}
                  <strong style={{ fontWeight: 600 }}>{pad2(data.hospitality.vipCount)}</strong> VIP{data.hospitality.vipCount === 1 ? "" : "s"} attendu{data.hospitality.vipCount === 1 ? "" : "s"}.
                  {data.hospitality.pendingServiceRequests > 0 && (
                    <>
                      {" "}
                      <strong style={{ fontWeight: 600 }}>{pad2(data.hospitality.pendingServiceRequests)}</strong> demande{data.hospitality.pendingServiceRequests === 1 ? "" : "s"} en attente.
                    </>
                  )}
                </span>
                {data.hospitality.urgentRequests.length > 0 && (
                  <span
                    className="t-13"
                    style={{
                      display: "block",
                      marginTop: "var(--space-2)",
                      fontStyle: "normal",
                      color: "var(--danger)",
                    }}
                  >
                    Urgent · {data.hospitality.urgentRequests[0].guestName} · {data.hospitality.urgentRequests[0].room} — {data.hospitality.urgentRequests[0].text}
                  </span>
                )}
              </aside>
            )}
          </div>
        </div>
      </header>

      <hr className="poster-rule" style={{ margin: "var(--space-4) 0" }} />

      {/* ─── ZONE B : Brief / Suggestions / Watchlist ─────────────── */}
      <section
        className="flex-1 min-h-0 overflow-hidden flex flex-col"
        style={{ gap: "var(--space-4)" }}
      >
        <header className="flex items-baseline justify-between" style={{ gap: "var(--space-6)" }}>
          <h2 className="poster-eyebrow">Brief du jour</h2>
          <span className="poster-eyebrow" style={{ color: "var(--text-faint)" }}>
            {dateParts.dayMonthShort}
          </span>
        </header>

        {briefReady ? (
          <article
            className="poster-brief-incipit"
            style={{ maxWidth: "var(--width-prose-brief)" }}
          >
            <span className="dropcap">{briefIncipit?.[0] ?? ""}</span>
            {briefIncipit?.slice(1)}
            <span style={{ display: "block", clear: "both", marginTop: "var(--space-4)" }}>
              <a
                href="/briefing"
                style={{
                  color: "var(--cykan)",
                  borderBottom: "1px solid var(--cykan-border)",
                  fontSize: "16px",
                  paddingBottom: "2px",
                }}
              >
                Lire la suite →
              </a>
            </span>
          </article>
        ) : (
          <div className="flex flex-col" style={{ gap: "var(--space-4)", maxWidth: "var(--width-prose-brief)" }}>
            <p className="t-15" style={{ color: "var(--text-muted)" }}>
              Aucun brief pour aujourd'hui. Hearst synthétise tes emails 24h, messages Slack,
              agenda du jour, PRs GitHub et issues Linear en un éditorial de 2 minutes.
            </p>
            <button
              type="button"
              className="poster-cta is-compact"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? "Génération en cours…" : "Générer le brief du matin"}
              <span className="arrow">→</span>
            </button>
          </div>
        )}

        {data.suggestions.length > 0 && (
          <div className="flex flex-col min-h-0">
            <h2 className="poster-eyebrow" style={{ marginBottom: "var(--space-2)" }}>
              Suggestions
            </h2>
            {data.suggestions.map((s) => (
              <button key={s.id} type="button" className="cockpit-action is-compact">
                <span className="ca-label">{s.title}</span>
                <span className="ca-hotkey">{s.status === "ready" ? "Prêt" : "Partiel"}</span>
              </button>
            ))}
          </div>
        )}

        {data.watchlist.length > 0 && (
          <div className="flex flex-col min-h-0">
            <h2 className="poster-eyebrow" style={{ marginBottom: "var(--space-3)" }}>
              Watchlist
            </h2>
            <div
              className="grid"
              style={{
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: "var(--space-6)",
              }}
            >
              {data.watchlist.map((w) => (
                <div key={w.id} className="kpi-tile">
                  <span className="kpi-num">{w.value}</span>
                  <span className="kpi-label">{w.label}</span>
                  {w.delta && (
                    <span
                      className="t-11"
                      style={{
                        color:
                          w.anomaly?.direction === "down"
                            ? "var(--danger)"
                            : "var(--color-success)",
                      }}
                    >
                      {w.delta}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ─── ZONE C : Quick actions bar ───────────────────────────── */}
      <footer
        className="flex-none flex items-center"
        style={{
          gap: "var(--space-6)",
          marginTop: "var(--space-3)",
          paddingTop: "var(--space-3)",
          borderTop: "1px solid var(--line-strong)",
        }}
      >
        <a
          href="/missions"
          className="poster-eyebrow transition-opacity hover:opacity-80"
          style={{ color: "var(--text-faint)" }}
        >
          Missions →
        </a>
        <a
          href="/assets"
          className="poster-eyebrow transition-opacity hover:opacity-80"
          style={{ color: "var(--text-faint)" }}
        >
          Assets →
        </a>
        <a
          href="/briefing"
          className="poster-eyebrow transition-opacity hover:opacity-80"
          style={{ color: "var(--text-faint)" }}
        >
          Briefing →
        </a>
        {data.missionsRunning.length > 0 && (
          <span
            className="poster-eyebrow"
            style={{ marginLeft: "auto", color: "var(--cykan)" }}
          >
            {pad2(data.missionsRunning.length)} en cours
          </span>
        )}
      </footer>
    </div>
  );
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function extractFirstName(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    const first = name.trim().split(/\s+/)[0];
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }
  if (email) {
    const local = email.split("@")[0];
    const first = local.split(/[._-]/)[0] ?? local;
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }
  return "Adrien";
}

function formatDate(d: Date | null): {
  weekday: string;
  dayMonth: string;
  dayMonthShort: string;
  time: string | null;
} {
  if (!d) return { weekday: "", dayMonth: "", dayMonthShort: "", time: null };
  const weekday = d.toLocaleDateString("fr-FR", { weekday: "long" });
  const day = d.getDate();
  const month = d.toLocaleDateString("fr-FR", { month: "long" });
  const dayMonth = day === 1 ? `1ᵉʳ ${month}` : `${day} ${month}`;
  const dayMonthShort = day === 1 ? `1ᵉʳ ${month}` : `${day} ${month}`;
  const time = d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return {
    weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
    dayMonth,
    dayMonthShort,
    time,
  };
}

function computeObservation(data: CockpitTodayPayload): string | null {
  const failed = data.missionsRunning.find((m) => m.status === "failed");
  if (failed) {
    return `${capitalize(failed.name)} a échoué au dernier run. À surveiller.`;
  }

  const blocked = data.missionsRunning.find((m) => m.status === "blocked");
  if (blocked) {
    return `${capitalize(blocked.name)} est bloquée — vérifie les credentials.`;
  }

  const anomalyItem = data.watchlist.find((w) => w.anomaly);
  if (anomalyItem?.anomaly) {
    return anomalyItem.anomaly.narration;
  }

  const ready = data.suggestions.find((s) => s.status === "ready");
  if (ready) {
    return `Suggestion prête à exécuter : ${ready.title.toLowerCase()}.`;
  }

  if (data.inbox.needsConnection) {
    return "Connecte Gmail ou Slack pour activer ton inbox du matin.";
  }

  if (data.inbox.stale) {
    return "Ton brief inbox est plus vieux que 1h. Refresh recommandé.";
  }

  return null;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function stripMarkdown(s: string): string {
  return s
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{2,}/g, " — ")
    .replace(/\n/g, " ")
    .trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.7 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}
