"use client";

import { useCallback, useEffect, useState } from "react";
import { CockpitHome } from "../cockpit/CockpitHome";
import { OnboardingTour } from "../OnboardingTour";
import type { CockpitTodayPayload } from "@/lib/cockpit/today";

/**
 * CockpitStage — home polymorphe (mode="cockpit").
 *
 * Affiche au mount un agrégat /api/v2/cockpit/today : briefing + watchlist
 * KPIs + missions running + suggestions actionables + quick launch. La
 * constellation Hearst reste en background.
 *
 * Loading : skeleton 3 sections (Hero / Watchlist / Suggestions) — pas de
 * spinner. Sync client au mount (même si RSC a pré-hydraté) pour des KPI
 * à jour ; phase B : focus / visibilité.
 *
 * Empty states : chaque section a son CTA contextuel (pas de glyphes seuls
 * selon la règle CLAUDE.md §5).
 */
interface CockpitStageProps {
  /**
   * Phase C5 — payload Cockpit pré-fetché par le RSC parent (`page.tsx`).
   * First paint immédiat + sync client au mount pour éviter des KPI figés.
   */
  initialData?: CockpitTodayPayload | null;
}

function logCockpitSyncedDev(payload: CockpitTodayPayload) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[CockpitStage] cockpit/today synchronisé", {
    assets: payload.counts.assets,
    missions: payload.counts.missions,
    reports: payload.counts.reports,
    missionsRunning: payload.missionsRunning.length,
    generatedAt: payload.generatedAt,
  });
}

export function CockpitStage({ initialData = null }: CockpitStageProps = {}) {
  const [data, setData] = useState<CockpitTodayPayload | null>(initialData);
  const [loading, setLoading] = useState(initialData === null);
  const [error, setError] = useState<string | null>(null);

  const applyCockpitPayload = useCallback((payload: CockpitTodayPayload) => {
    setData(payload);
    setError(null);
    logCockpitSyncedDev(payload);
  }, []);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/cockpit/today", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as CockpitTodayPayload;
      applyCockpitPayload(payload);
    } catch (err) {
      setData((prev) => {
        if (prev !== null) {
          console.warn(
            "[CockpitStage] refetch cockpit échoué, conservation du snapshot :",
            err instanceof Error ? err.message : err,
          );
          return prev;
        }
        setError(err instanceof Error ? err.message : "Erreur");
        return prev;
      });
    } finally {
      setLoading(false);
    }
  }, [applyCockpitPayload]);

  useEffect(() => {
    // initialData (RSC) sert au LCP ; on synchronise toujours au mount avec
    // l’API pour éviter des KPI figés sur le snapshot SSR (session longue).
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/v2/cockpit/today", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as CockpitTodayPayload;
        if (!cancelled) applyCockpitPayload(payload);
      } catch (err) {
        if (!cancelled) {
          setData((prev) => {
            if (prev !== null) {
              console.warn(
                "[CockpitStage] refresh cockpit échoué, conservation du snapshot :",
                err instanceof Error ? err.message : err,
              );
              return prev;
            }
            setError(err instanceof Error ? err.message : "Erreur");
            return prev;
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [applyCockpitPayload]);

  const isHospitality = data?.industry === "hospitality";
  // refetch est conservé pour usage futur (refresh inbox, suggestions live)
  void refetch;

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      <OnboardingTour />
      {isHospitality && <HospitalityBadge />}
      {loading && <CockpitSkeleton />}
      {!loading && error && <CockpitErrorState message={error} />}
      {!loading && !error && data && <CockpitHome data={data} />}
    </div>
  );
}

function HospitalityBadge() {
  return (
    <div
      className="flex items-center justify-end"
      style={{
        padding: "var(--space-3) var(--space-12) 0",
      }}
    >
      <a
        href="/hospitality"
        className="t-11 font-light transition-opacity hover:opacity-80"
        style={{
          color: "var(--gold)",
          padding: "var(--space-1) var(--space-3)",
          border: "1px solid var(--gold-border)",
          borderRadius: "var(--radius-pill)",
          background: "var(--gold-surface)",
        }}
      >
        Hospitality
      </a>
    </div>
  );
}

function CockpitSkeleton() {
  return (
    <div
      className="flex-1 flex flex-col"
      style={{ padding: "var(--space-12) var(--space-14)" }}
      aria-busy="true"
      aria-live="polite"
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: "minmax(280px, 0.9fr) minmax(0, 1.4fr)",
          gap: "var(--space-12)",
          alignItems: "start",
        }}
      >
        <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
          <div
            className="animate-pulse"
            style={{
              height: "var(--space-24)",
              width: "70%",
              background: "var(--surface-1)",
              borderRadius: "var(--radius-xs)",
            }}
          />
          <div
            className="animate-pulse"
            style={{
              height: "var(--space-16)",
              width: "55%",
              background: "var(--surface-1)",
              borderRadius: "var(--radius-xs)",
            }}
          />
        </div>
        <div className="flex flex-col" style={{ gap: "var(--space-5)" }}>
          <div
            className="animate-pulse"
            style={{
              height: "var(--space-10)",
              width: "var(--space-32)",
              background: "var(--surface-1)",
              borderRadius: "var(--radius-xs)",
            }}
          />
          <div
            className="animate-pulse"
            style={{
              height: "var(--space-24)",
              width: "80%",
              background: "var(--surface-1)",
              borderRadius: "var(--radius-xs)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function CockpitErrorState({ message }: { message: string }) {
  return (
    <div
      className="flex-1 flex flex-col items-start justify-center"
      style={{ padding: "var(--space-12) var(--space-14)", gap: "var(--space-3)" }}
    >
      <span className="poster-eyebrow">Cockpit · erreur</span>
      <p style={{ color: "var(--text)", fontSize: "20px", maxWidth: "var(--width-prose-narrow)", lineHeight: 1.4 }}>
        Impossible de charger ton cockpit pour le moment.
      </p>
      <p style={{ color: "var(--text-faint)", fontFamily: "ui-monospace, monospace", fontSize: "12px" }}>
        {message}
      </p>
    </div>
  );
}
