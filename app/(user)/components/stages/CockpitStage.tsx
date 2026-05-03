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
 * spinner. Refetch on mount uniquement (MVP) ; phase B ajoutera un focus
 * listener pour rafraîchir au retour de l'user.
 *
 * Empty states : chaque section a son CTA contextuel (pas de glyphes seuls
 * selon la règle CLAUDE.md §5).
 */
interface CockpitStageProps {
  /**
   * Phase C5 — payload Cockpit pré-fetché par le RSC parent (`page.tsx`).
   * Si fourni, on skip le fetch initial et on rend les sections live au
   * first paint → gain LCP. Null = client fetch normal en fallback (cas
   * scope dev / hot reload / refetch après run).
   */
  initialData?: CockpitTodayPayload | null;
}

export function CockpitStage({ initialData = null }: CockpitStageProps = {}) {
  const [data, setData] = useState<CockpitTodayPayload | null>(initialData);
  const [loading, setLoading] = useState(initialData === null);
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
    // Si le RSC parent a déjà fourni initialData, on skip le fetch initial.
    // Le bouton refresh + onInboxRefreshed appellent quand même `refetch`.
    if (initialData !== null) return;

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
  }, [initialData]);

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
