"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { CockpitTodayPayload } from "@/lib/cockpit/today";
import { toast } from "@/app/hooks/use-toast";
import { useServicesStore } from "@/stores/services";

interface CockpitPosterProps {
  data: CockpitTodayPayload;
  onBriefRefreshed?: () => void;
}

// Sources "noyau" : 5 apps hardcodées qui ont des fetchers spécialisés dans
// le brief assembler. Affichées toujours, même non-connectées (suggestion).
const INBOX_SOURCE_IDS = ["gmail", "slack", "linear", "calendar", "github"] as const;
type InboxSourceId = (typeof INBOX_SOURCE_IDS)[number];
const INBOX_SOURCE_LABELS: Record<InboxSourceId, string> = {
  gmail: "Gmail",
  slack: "Slack",
  linear: "Linear",
  calendar: "Calendar",
  github: "GitHub",
};

function isCoreSource(id: string): id is InboxSourceId {
  return (INBOX_SOURCE_IDS as readonly string[]).includes(id);
}

export function CockpitPoster({ data, onBriefRefreshed }: CockpitPosterProps) {
  const { data: session } = useSession();
  const services = useServicesStore((s) => s.services);
  const [now, setNow] = useState<Date | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const firstName = useMemo(() => extractFirstName(session?.user?.name, session?.user?.email), [session]);
  const dateParts = useMemo(() => formatDate(now), [now]);

  const sourcesStatus = useMemo(() => {
    const connectedMap = new Map(
      services.filter((s) => s.connectionStatus === "connected").map((s) => [s.id, s]),
    );

    // 5 sources noyau (Gmail, Calendar, Slack, GitHub, Linear) toujours affichées
    const core = INBOX_SOURCE_IDS.map((id) => ({
      id: id as string,
      label: INBOX_SOURCE_LABELS[id],
      connected: connectedMap.has(id),
    }));

    // Sources connectées additionnelles (Notion, Jira, HubSpot, etc.)
    const extras = Array.from(connectedMap.values())
      .filter((s) => !isCoreSource(s.id))
      .map((s) => ({
        id: s.id,
        label: s.name ?? s.id,
        connected: true,
      }));

    return [...core, ...extras];
  }, [services]);
  const connectedSources = sourcesStatus.filter((s) => s.connected);
  // Suggestions d'ajout : seulement les sources noyau manquantes
  // (les extras Composio sont à connecter via /apps si l'user le veut)
  const missingSources = sourcesStatus.filter((s) => !s.connected && isCoreSource(s.id));

  const observation = useMemo(
    () => computeObservation(data, connectedSources.length),
    [data, connectedSources.length],
  );
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
        padding: "var(--space-4) var(--space-8) var(--space-3)",
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
        style={{ gap: "var(--space-3)", marginTop: "var(--space-4)" }}
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
            <h2
              className="t-13 font-medium"
              style={{ color: "var(--text-l1)" }}
            >
              Brief du jour
            </h2>
            <span className="t-11 font-light" style={{ color: "var(--text-faint)" }}>
              {dateParts.dayMonthShort}
            </span>
          </header>
          {briefReady ? (
            <>
              <div style={{ maxHeight: "var(--height-brief-card)", overflow: "hidden", position: "relative" }}>
                <p className="body">
                  {briefSentence.first && <strong>{briefSentence.first}</strong>}
                  {briefSentence.rest && <> {briefSentence.rest}</>}
                </p>
                <div aria-hidden style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 40, background: "linear-gradient(transparent, var(--surface-1))" }} />
              </div>
              <a href="/briefing" className="read-more">
                Lire la suite →
              </a>
            </>
          ) : (
            <>
              <p className="body" style={{ color: "var(--text-muted)" }}>
                {connectedSources.length === 0 ? (
                  <>
                    <strong style={{ color: "var(--text)" }}>Hearst observe ton quotidien.</strong>{" "}
                    Connecte tes sources — je m’occupe de l’éditorial du matin.
                  </>
                ) : missingSources.length === 0 ? (
                  <>
                    <strong style={{ color: "var(--text)" }}>Tes sources sont prêtes.</strong>{" "}
                    Génère ton brief — je consolide les signaux du matin.
                  </>
                ) : (
                  <>
                    <strong style={{ color: "var(--text)" }}>
                      {connectedSources.length} source{connectedSources.length > 1 ? "s" : ""} connectée{connectedSources.length > 1 ? "s" : ""}.
                    </strong>{" "}
                    Tu peux générer ton brief maintenant ou ajouter {humanJoin(missingSources.map((s) => s.label))} pour plus de signal.
                  </>
                )}
              </p>
              <div
                className="t-11 font-light flex flex-wrap"
                style={{ gap: "var(--space-3)", color: "var(--text-faint)" }}
              >
                {sourcesStatus.map((s, i) => (
                  <span
                    key={s.id}
                    className="inline-flex items-baseline"
                    style={{ gap: "var(--space-1)" }}
                  >
                    {i > 0 && <span style={{ color: "var(--text-decor-25)" }}>·</span>}
                    <span
                      style={{
                        color: s.connected ? "var(--cykan)" : "var(--text-faint)",
                        opacity: s.connected ? 1 : 0.6,
                      }}
                    >
                      {s.label}
                    </span>
                  </span>
                ))}
              </div>
              {connectedSources.length === 0 ? (
                <a href="/apps" className="read-more">
                  Connecter une source →
                </a>
              ) : (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="read-more"
                >
                  {generating ? "Génération en cours…" : "Générer le brief →"}
                </button>
              )}
            </>
          )}
        </article>

        {data.hospitality && (
          <article
            className="poster-brief-block"
            style={{ borderLeftColor: "var(--gold)", background: "var(--gold-surface)" }}
          >
            <header className="flex items-baseline justify-between" style={{ gap: "var(--space-4)" }}>
              <h2 className="t-13 font-medium" style={{ color: "var(--gold)" }}>
                Hôtel · {data.hospitality.source === "demo" ? "Données de démo" : "Live"}
              </h2>
              <span className="t-11 font-light" style={{ color: "var(--text-faint)" }}>
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
            <h2
              className="t-13 font-medium"
              style={{ color: "var(--text-l1)" }}
            >
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
      </main>

      {/* Footer nav retiré 2026-05-03 : doublon avec ContextRail (cards
         Missions/Assets cliquables) + TimelineRail. Le compteur "X en cours"
         remonte dans la card Missions du rail droit. */}
    </div>
  );
}

function humanJoin(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ou ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ou ${items[items.length - 1]}`;
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

function computeObservation(
  data: CockpitTodayPayload,
  connectedInboxSourcesCount: number,
): string | null {
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

  // Inbox states : on ne re-formule qu'une seule fois la même intention que
  // le brief block. Si zéro source → message déjà porté par le brief block,
  // on évite le doublon en haut. Sinon on parle du brief lui-même.
  if (connectedInboxSourcesCount === 0) {
    return null;
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
