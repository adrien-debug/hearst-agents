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
  const missionsRunning = data.missionsRunning.length;

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
      className="flex-1 flex flex-col min-h-0"
      style={{ padding: "var(--space-12) var(--space-14) var(--space-8)" }}
    >
      <header
        className="grid"
        style={{
          gridTemplateColumns: "minmax(420px, 1.2fr) minmax(0, 1fr)",
          gap: "var(--space-12)",
          alignItems: "start",
          marginBottom: "var(--space-10)",
        }}
      >
        <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
          <span className="poster-eyebrow">Hearst · Cockpit</span>
          <div className="flex flex-col" style={{ gap: "var(--space-1)" }}>
            <span className="poster-display is-display-l" style={{ color: "var(--text)" }}>
              {dateParts.weekday}
            </span>
            <span className="poster-display is-display-m" style={{ color: "var(--text-muted)" }}>
              {dateParts.dayMonth}
            </span>
          </div>
          <div className="poster-time-tick" style={{ marginTop: "var(--space-4)" }}>
            <span className="poster-pulse" aria-hidden />
            <span>{dateParts.time ?? "--:--:--"}</span>
            <span style={{ color: "var(--text-decor-25)" }}>·</span>
            <span>Système éveillé</span>
          </div>
        </div>

        <div className="flex flex-col" style={{ gap: "var(--space-6)" }}>
          <h1 className="poster-greeting" style={{ color: "var(--text)" }}>
            Bonjour {firstName}.
          </h1>
          <p
            className="poster-prose"
            style={{ color: "var(--text-muted)", maxWidth: "var(--width-prose)" }}
          >
            <span className="kpi">{pad2(assetsTotal)}</span> asset{assetsTotal === 1 ? "" : "s"} dans ta bibliothèque.
            {" "}
            <span className="kpi">{pad2(missionsTotal)}</span> mission{missionsTotal === 1 ? "" : "s"} planifiée{missionsTotal === 1 ? "" : "s"}
            {missionsRunning > 0 ? `, dont ${pad2(missionsRunning)} en cours` : ""}.
            {" "}
            <span className="kpi">{pad2(reportsTotal)}</span> report{reportsTotal === 1 ? "" : "s"} archivé{reportsTotal === 1 ? "" : "s"}.
          </p>
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
                style={{
                  color: "var(--gold)",
                  display: "block",
                  marginBottom: "var(--space-2)",
                }}
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
                    <strong style={{ fontWeight: 600, fontStyle: "normal" }}>{pad2(data.hospitality.pendingServiceRequests)}</strong> demande{data.hospitality.pendingServiceRequests === 1 ? "" : "s"} en attente.
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
      </header>

      <hr className="poster-rule" />

      <section
        className="flex-1 flex flex-col min-h-0"
        style={{
          padding: "var(--space-10) 0 var(--space-6)",
          gap: "var(--space-6)",
        }}
      >
        <header
          className="flex items-baseline justify-between"
          style={{ gap: "var(--space-6)" }}
        >
          <span className="poster-eyebrow">Brief du jour</span>
          <span className="poster-eyebrow" style={{ color: "var(--text-faint)" }}>
            {dateParts.dayMonthShort}
          </span>
        </header>

        {briefReady ? (
          <article
            className="poster-brief-incipit"
            style={{ maxWidth: "var(--width-prose-wide)" }}
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
          <div className="flex flex-col" style={{ gap: "var(--space-5)", maxWidth: "var(--width-prose-wide)" }}>
            <p
              className="poster-prose"
              style={{ color: "var(--text-muted)", fontSize: "clamp(16px, 1.2vw, 19px)" }}
            >
              Aucun brief pour aujourd'hui. Hearst synthétise tes emails 24h, messages Slack,
              agenda du jour, PRs GitHub et issues Linear en un éditorial de 2 minutes.
            </p>
            <button
              type="button"
              className="poster-cta"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? "Génération en cours…" : "Générer le brief du matin"}
              <span className="arrow">→</span>
            </button>
          </div>
        )}
      </section>
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
