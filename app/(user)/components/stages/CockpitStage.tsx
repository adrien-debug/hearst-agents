"use client";

import { useCallback, useEffect, useState } from "react";
import { HearstConstellation } from "./HearstConstellation";
import { CockpitHero } from "./CockpitHero";
import { WatchlistCard } from "../cockpit/WatchlistCard";
import { MissionPulse } from "../cockpit/MissionPulse";
import { SuggestionRow } from "../cockpit/SuggestionRow";
import { QuickLaunch } from "../cockpit/QuickLaunch";
import { InboxSection } from "../cockpit/InboxSection";
import type { CockpitTodayPayload } from "@/lib/cockpit/today";

/**
 * CockpitStage — home polymorphe (mode="cockpit").
 *
 * Affiche au mount un agrégat /api/v2/cockpit/today : briefing + watchlist
 * KPIs + missions running + suggestions actionables + quick launch. La
 * constellation Hearst reste en background.
 *
 * Loading : skeleton 3 sections (Hero / Watchlist / Suggestions) — pas de
 * spinner. Refetch on mount uniquement (MVP) ; phase B ajoutera un focus
 * listener pour rafraîchir au retour de l'user.
 *
 * Empty states : chaque section a son CTA contextuel (pas de glyphes seuls
 * selon la règle CLAUDE.md §5).
 */
export function CockpitStage() {
  const [data, setData] = useState<CockpitTodayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/cockpit/today", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as CockpitTodayPayload;
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/v2/cockpit/today", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as CockpitTodayPayload;
        if (!cancelled) {
          setData(payload);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="cockpit-bg flex-1 flex flex-col min-h-0 relative overflow-hidden panel-enter">
      <HearstConstellation />

      <div className="relative flex-1 flex flex-col min-h-0 overflow-y-auto">
        <CockpitHero
          briefing={data?.briefing}
          emptyAction={
            data?.briefing.empty
              ? { label: "Connecter mes apps", href: "/apps" }
              : undefined
          }
        />

        <div
          className="flex flex-col"
          style={{
            padding: "0 var(--space-12) var(--space-14)",
            gap: "var(--space-12)",
          }}
        >
          {loading && <CockpitSkeleton />}
          {!loading && error && <CockpitErrorState message={error} />}
          {!loading && !error && data && (
            <CockpitContent data={data} onInboxRefreshed={refetch} />
          )}
        </div>
      </div>
    </div>
  );
}

function CockpitContent({
  data,
  onInboxRefreshed,
}: {
  data: CockpitTodayPayload;
  onInboxRefreshed: () => void;
}) {
  const watchlistMock = data.mockSections.includes("watchlist");

  return (
    <>
      <InboxSection inbox={data.inbox} onRefreshed={onInboxRefreshed} />

      <Section
        label="Watchlist"
        meta={watchlistMock ? "demo data" : undefined}
      >
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
          style={{ gap: "var(--space-4)" }}
        >
          {data.watchlist.map((kpi) => (
            <WatchlistCard
              key={kpi.id}
              label={kpi.label}
              value={kpi.value}
              delta={kpi.delta}
              trend={kpi.trend}
              isMock={kpi.source === "mock"}
            />
          ))}
        </div>
      </Section>

      <Section label="En cours">
        {data.missionsRunning.length > 0 ? (
          <div
            className="grid grid-cols-1 md:grid-cols-2"
            style={{ gap: "var(--space-4)" }}
          >
            {data.missionsRunning.map((m) => (
              <MissionPulse
                key={m.id}
                id={m.id}
                name={m.name}
                status={m.status}
                runningSince={m.runningSince}
                lastRunAt={m.lastRunAt}
                lastError={m.lastError}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            text="Aucune mission active."
            cta={{ label: "Programmer une mission", href: "/missions" }}
          />
        )}
      </Section>

      <Section label="Suggestions">
        {data.suggestions.length > 0 ? (
          <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            {data.suggestions.map((s) => (
              <SuggestionRow
                key={s.id}
                specId={s.id}
                title={s.title}
                description={s.description}
                status={s.status}
                missingApps={s.missingApps}
                requiredCount={s.requiredApps.length}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            text="Connecte une app pour débloquer des suggestions."
            cta={{ label: "Voir les apps", href: "/apps" }}
          />
        )}
      </Section>

      <Section label="Quick launch">
        <QuickLaunch favoriteReports={data.favoriteReports} />
      </Section>
    </>
  );
}

function Section({
  label,
  meta,
  children,
}: {
  label: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col" style={{ gap: "var(--space-5)" }}>
      <header className="flex items-center justify-between">
        <span
          className="t-9 font-mono uppercase"
          style={{
            letterSpacing: "var(--tracking-marquee)",
            color: "var(--text-l2)",
          }}
        >
          {label}
        </span>
        {meta && (
          <span
            className="t-9 font-mono uppercase"
            style={{
              letterSpacing: "var(--tracking-display)",
              color: "var(--text-ghost)",
            }}
          >
            {meta}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

function CockpitSkeleton() {
  return (
    <div
      className="flex flex-col"
      style={{ gap: "var(--space-12)" }}
      aria-busy="true"
      aria-live="polite"
    >
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        style={{ gap: "var(--space-4)" }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="card-depth animate-pulse"
            style={{
              height: "var(--space-24)",
              padding: "var(--space-5)",
            }}
          />
        ))}
      </div>
      <div
        className="grid grid-cols-1 md:grid-cols-2"
        style={{ gap: "var(--space-4)" }}
      >
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="card-depth animate-pulse"
            style={{
              height: "var(--space-20)",
              padding: "var(--space-5)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function CockpitErrorState({ message }: { message: string }) {
  return (
    <div
      className="card-depth flex flex-col items-start"
      style={{
        padding: "var(--space-6)",
        gap: "var(--space-3)",
      }}
    >
      <span
        className="t-9 font-mono uppercase"
        style={{
          letterSpacing: "var(--tracking-marquee)",
          color: "var(--text-faint)",
        }}
      >
        cockpit · erreur
      </span>
      <p className="t-13" style={{ color: "var(--text-l1)" }}>
        Impossible de charger ton cockpit pour le moment.
      </p>
      <p className="t-11 font-mono" style={{ color: "var(--text-faint)" }}>
        {message}
      </p>
    </div>
  );
}

function EmptyState({
  text,
  cta,
}: {
  text: string;
  cta: { label: string; href: string };
}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: "var(--space-5) var(--space-6)",
        border: "1px dashed var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        gap: "var(--space-4)",
      }}
    >
      <p className="t-13" style={{ color: "var(--text-l2)" }}>
        {text}
      </p>
      <a
        href={cta.href}
        className="t-9 font-mono uppercase shrink-0"
        style={{
          letterSpacing: "var(--tracking-marquee)",
          color: "var(--cykan)",
        }}
      >
        {cta.label} →
      </a>
    </div>
  );
}
