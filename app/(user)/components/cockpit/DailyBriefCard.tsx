"use client";

/**
 * DailyBriefCard — section Cockpit "Personal CIA Briefing" (vague 9, action #2).
 *
 * Affiche, dans le Cockpit :
 *  - Si un brief existe pour aujourd'hui → la une (lead narration) + lien PDF
 *    + meta (nb signaux, sources contributrices)
 *  - Sinon → bouton « Générer le brief du jour »
 *
 * Au clic du bouton, POST /api/v2/daily-brief/generate puis poll /today
 * jusqu'à ce que le brief apparaisse (max ~60s).
 *
 * Tokens design system uniquement (cf. CLAUDE.md §1).
 */

import { useCallback, useEffect, useState } from "react";

interface DailyBriefDto {
  assetId: string;
  title: string;
  summary: string | null;
  createdAt: number;
  narration: {
    lead: string;
    people: string;
    decisions: string;
    signals: string;
    costUsd: number;
  };
  meta: {
    totalItems: number;
    sources: string[];
    targetDate: string;
    pdfUrl: string | null;
    storageKey: string | null;
    pdfSizeBytes: number | null;
  };
  counts: {
    emails: number;
    slack: number;
    calendar: number;
    github: number;
    linear: number;
  };
  pdfUrl: string | null;
}

const TIME_FMT = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_MS = 90_000;

export function DailyBriefCard() {
  const [brief, setBrief] = useState<DailyBriefDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBrief = useCallback(async (): Promise<DailyBriefDto | null> => {
    try {
      const res = await fetch("/api/v2/daily-brief/today", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { brief: DailyBriefDto | null };
      return data.brief;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const b = await fetchBrief();
      if (!cancelled) {
        setBrief(b);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchBrief]);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/v2/daily-brief/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        setError(errBody.error ?? `HTTP ${res.status}`);
        setGenerating(false);
        return;
      }

      const data = (await res.json()) as {
        status: string;
        assetId?: string;
        pdfUrl?: string | null;
      };

      // Cas 1 : exists ou inline-ok → on a déjà le brief, on refetch
      if (data.status === "exists" || data.status === "inline-ok") {
        const b = await fetchBrief();
        setBrief(b);
        setGenerating(false);
        return;
      }

      // Cas 2 : pending (job enqueued) → poll
      const deadline = Date.now() + POLL_MAX_MS;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const b = await fetchBrief();
        if (b) {
          setBrief(b);
          setGenerating(false);
          return;
        }
      }
      setError("Timeout : le brief n'est pas arrivé dans le délai.");
      setGenerating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setGenerating(false);
    }
  };

  if (loading) {
    return <BriefSkeleton />;
  }

  if (!brief) {
    return <BriefEmptyState onGenerate={handleGenerate} generating={generating} error={error} />;
  }

  return <BriefDisplay brief={brief} onRegenerate={handleGenerate} generating={generating} />;
}

function BriefSkeleton() {
  return (
    <div
      style={{
        padding: "var(--space-6)",
        background: "var(--bg-soft)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-shell)",
      }}
    >
      <p className="t-11 font-light text-[var(--text-faint)]">Chargement Daily Brief…</p>
    </div>
  );
}

function BriefEmptyState({
  onGenerate,
  generating,
  error,
}: {
  onGenerate: () => void;
  generating: boolean;
  error: string | null;
}) {
  return (
    <div
      style={{
        padding: "var(--space-6)",
        background: "var(--bg-soft)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-shell)",
      }}
    >
      <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
        <div className="flex items-baseline justify-between">
          <span
            className="t-9 font-medium"
            style={{
              color: "var(--gold)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Daily Brief
          </span>
          <span className="t-9 font-light text-[var(--text-faint)]">
            Aujourd&apos;hui
          </span>
        </div>
        <p className="t-13 font-light" style={{ color: "var(--text-l1)", lineHeight: 1.5 }}>
          Aucun brief généré pour aujourd&apos;hui. Le brief synthétise emails 24h,
          messages Slack, agenda du jour, PRs GitHub et issues Linear en un PDF
          éditorial.
        </p>
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="t-11 font-medium transition-opacity self-start"
          style={{
            padding: "var(--space-2) var(--space-5)",
            borderRadius: "var(--radius-pill)",
            background: generating ? "var(--bg-elev)" : "var(--cykan)",
            color: generating ? "var(--text-faint)" : "var(--bg)",
            opacity: generating ? 0.7 : 1,
          }}
        >
          {generating ? "Génération en cours…" : "Générer le brief du jour"}
        </button>
        {error && (
          <p className="t-9 font-light" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function BriefDisplay({
  brief,
  onRegenerate,
  generating,
}: {
  brief: DailyBriefDto;
  onRegenerate: () => void;
  generating: boolean;
}) {
  const sourcesLive = brief.meta.sources.filter(
    (s) => !s.endsWith(":error") && !s.endsWith(":empty"),
  );
  return (
    <div
      style={{
        padding: "var(--space-6)",
        background: "var(--bg-soft)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-shell)",
      }}
    >
      <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
        <div className="flex items-baseline justify-between">
          <span
            className="t-9 font-medium"
            style={{
              color: "var(--gold)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Daily Brief
          </span>
          <span className="t-9 font-light text-[var(--text-faint)]">
            Généré {TIME_FMT.format(new Date(brief.createdAt))}
          </span>
        </div>

        <p
          className="t-15 font-light"
          style={{
            color: "var(--text-l1)",
            lineHeight: 1.55,
            fontStyle: "italic",
          }}
        >
          {brief.narration.lead}
        </p>

        <div className="flex items-center" style={{ gap: "var(--space-4)" }}>
          <span className="t-9 font-light text-[var(--text-faint)]">
            {brief.meta.totalItems} signaux
          </span>
          {sourcesLive.length > 0 && (
            <span className="t-9 font-light text-[var(--text-faint)]">
              {sourcesLive.join(" · ")}
            </span>
          )}
        </div>

        <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
          {brief.pdfUrl && (
            <a
              href={brief.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="t-11 font-medium transition-opacity"
              style={{
                padding: "var(--space-2) var(--space-5)",
                borderRadius: "var(--radius-pill)",
                background: "var(--cykan)",
                color: "var(--bg)",
              }}
            >
              Ouvrir le PDF
            </a>
          )}
          <button
            type="button"
            onClick={onRegenerate}
            disabled={generating}
            className="t-11 font-light transition-opacity"
            style={{
              padding: "var(--space-2) var(--space-5)",
              borderRadius: "var(--radius-pill)",
              background: "transparent",
              color: "var(--text-l2)",
              border: "1px solid var(--border-default)",
              opacity: generating ? 0.5 : 1,
            }}
          >
            {generating ? "Régénération…" : "Régénérer"}
          </button>
        </div>
      </div>
    </div>
  );
}
