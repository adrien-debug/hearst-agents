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

  const observation = useMemo(() => computeObservation(data), [data]);
  const briefReady = !data.briefing.empty && Boolean(data.briefing.body);
  const briefIncipit = useMemo(
    () => (briefReady ? truncate(stripMarkdown(data.briefing.body ?? ""), 320) : null),
    [briefReady, data.briefing.body],
  );
  const briefSentence = useMemo(() => splitFirstSentence(briefIncipit ?? ""), [briefIncipit]);

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
        padding: "var(--space-8) var(--space-12) var(--space-4)",
      }}
    >
      {/* ─── Hero (greeting + status line) ────────────────────────── */}
      <header className="flex-none flex flex-col" style={{ gap: "var(--space-2)" }}>
        <h1 className="poster-greeting" style={{ color: "var(--text)" }}>
          Bonjour {firstName}.
        </h1>
        <div className="poster-time-tick">
          <span className="poster-pulse" aria-hidden />
          <span style={{ color: "var(--text-muted)" }}>
            {dateParts.weekday} {dateParts.dayMonth}
          </span>
          <span style={{ color: "var(--text-decor-25)" }}>·</span>
          <span>{dateParts.time ?? "--:--:--"}</span>
          <span style={{ color: "var(--text-decor-25)" }}>·</span>
          <span>Système éveillé</span>
        </div>
      </header>

      {/* ─── Body : brief éditorial + suggestions ────────────────── */}
      <main
        className="flex-1 min-h-0 flex flex-col"
        style={{ gap: "var(--space-5)", marginTop: "var(--space-8)" }}
      >
        {observation && (
          <p
            className="t-13"
            style={{
              color: "var(--text-muted)",
              fontStyle: "italic",
              borderLeft: "1px solid var(--cykan)",
              paddingLeft: "var(--space-3)",
            }}
          >
            {observation}
          </p>
        )}

        <article className="poster-brief-block">
          <header className="flex items-baseline justify-between" style={{ gap: "var(--space-4)" }}>
            <h2 className="poster-eyebrow">Brief du jour</h2>
            <span className="poster-eyebrow" style={{ color: "var(--text-faint)" }}>
              {dateParts.dayMonthShort}
            </span>
          </header>
          {briefReady ? (
            <>
              <p className="body">
                {briefSentence.first && <strong>{briefSentence.first}</strong>}
                {briefSentence.rest && <> {briefSentence.rest}</>}
              </p>
              <a href="/briefing" className="read-more">
                Lire la suite →
              </a>
            </>
          ) : (
            <>
              <p className="body" style={{ color: "var(--text-muted)" }}>
                <strong style={{ color: "var(--text)" }}>Hearst observe ton quotidien.</strong>{" "}
                Connecte tes sources — je m'occupe de l'éditorial du matin.
              </p>
              <div
                className="poster-eyebrow"
                style={{ color: "var(--text-decor-25)", letterSpacing: "0.18em" }}
              >
                Gmail · Slack · Linear · Calendar · GitHub
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="read-more"
              >
                {generating ? "Génération en cours…" : "Générer le brief →"}
              </button>
            </>
          )}
        </article>

        {data.hospitality && (
          <article
            className="poster-brief-block"
            style={{ borderLeftColor: "var(--gold)", background: "var(--gold-surface)" }}
          >
            <header className="flex items-baseline justify-between" style={{ gap: "var(--space-4)" }}>
              <h2 className="poster-eyebrow" style={{ color: "var(--gold)" }}>
                Hôtel · {data.hospitality.source === "demo" ? "Données de démo" : "Live"}
              </h2>
              <span className="poster-eyebrow" style={{ color: "var(--text-faint)" }}>
                {data.hospitality.occupancy}% occupé
              </span>
            </header>
            <p className="body">
              <strong>{pad2(data.hospitality.vipCount)}</strong> VIP{data.hospitality.vipCount === 1 ? "" : "s"} attendu{data.hospitality.vipCount === 1 ? "" : "s"}.
              {data.hospitality.pendingServiceRequests > 0 && (
                <>
                  {" "}
                  <strong>{pad2(data.hospitality.pendingServiceRequests)}</strong> demande{data.hospitality.pendingServiceRequests === 1 ? "" : "s"} en attente.
                </>
              )}
              {data.hospitality.urgentRequests.length > 0 && (
                <span style={{ display: "block", marginTop: "var(--space-2)", color: "var(--danger)" }}>
                  Urgent · {data.hospitality.urgentRequests[0].guestName} · {data.hospitality.urgentRequests[0].room} — {data.hospitality.urgentRequests[0].text}
                </span>
              )}
            </p>
          </article>
        )}

        {data.suggestions.length > 0 && (
          <div className="flex flex-col" style={{ gap: "var(--space-1)" }}>
            <h2 className="poster-eyebrow">Suggestions</h2>
            {data.suggestions.map((s) => (
              <button key={s.id} type="button" className="cockpit-action is-compact">
                <span className="ca-label">{s.title}</span>
                <span className="ca-hotkey">{s.status === "ready" ? "Prêt" : "Partiel"}</span>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* ─── Footer nav ──────────────────────────────────────────── */}
      <footer
        className="flex-none flex items-center"
        style={{
          gap: "var(--space-6)",
          marginTop: "var(--space-4)",
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

function splitFirstSentence(s: string): { first: string; rest: string } {
  if (!s) return { first: "", rest: "" };
  const idx = s.search(/[.!?]\s/);
  if (idx === -1) return { first: s, rest: "" };
  return { first: s.slice(0, idx + 1), rest: s.slice(idx + 2).trim() };
}
