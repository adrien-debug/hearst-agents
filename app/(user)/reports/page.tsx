"use client";

/**
 * /reports — Page Discovery des rapports.
 *
 * Affiche le catalogue complet des rapports disponibles pour le tenant :
 * prédéfinis (9) + templates personnalisés. Filtrage par domaine + toggle
 * Tous | Prêts | À connecter | Personnalisés.
 *
 * États : loading (skeleton 3×3), error (retry), empty filtré, empty total.
 *
 * Tokens uniquement — conforme CLAUDE.md + lint:visual strict.
 */

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ApplicableReport } from "@/lib/reports/catalog";
import { ReportCard, ReportCardSkeleton } from "@/app/(user)/components/reports/ReportCard";
import { PageHeader } from "@/app/(user)/components/PageHeader";

// ── Types ──────────────────────────────────────────────────────

type StatusFilter = "all" | "ready" | "needs-connection" | "custom";
type DomainFilter = "all" | string;

// ── Icons ──────────────────────────────────────────────────────

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-5.83" />
    </svg>
  );
}

function PlugIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18" />
      <path d="M7 17H4a2 2 0 0 1-2-2v-1c0-1.1.9-2 2-2h4" />
      <path d="M11 12L9 10" />
      <path d="M13 6l-2 2" />
      <path d="M18 2l4 4-1.5 1.5-4-4L18 2z" />
    </svg>
  );
}

// ── Domain list ────────────────────────────────────────────────

const ALL_DOMAINS = [
  { value: "all",       label: "Tous" },
  { value: "finance",   label: "Finance" },
  { value: "crm",       label: "CRM" },
  { value: "growth",    label: "Growth" },
  { value: "founder",   label: "Founder" },
  { value: "ops-eng",   label: "Eng" },
  { value: "support",   label: "Support" },
  { value: "people",    label: "People" },
  { value: "marketing", label: "Marketing" },
  { value: "ops",       label: "Ops" },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all",              label: "Tous" },
  { value: "ready",            label: "Prêts" },
  { value: "needs-connection", label: "À connecter" },
  { value: "custom",           label: "Personnalisés" },
];

// ── Skeleton grid ──────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div
      data-testid="loading-skeleton"
      className="grid grid-cols-1 gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <ReportCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────

export default function ReportsDiscoveryPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ApplicableReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [domainFilter, setDomainFilter] = useState<DomainFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports");
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      setReports(data.reports ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  // Chargement initial au mount
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch async : setState appelé uniquement dans les callbacks .then/.catch, pas synchrone
    setLoading(true);
    setError(null);
    fetch("/api/reports")
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        return res.json() as Promise<{ reports: ApplicableReport[] }>;
      })
      .then((data) => {
        if (!cancelled) setReports(data.reports ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erreur inconnue");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // ── Computed counts ─────────────────────────────────────────

  const counts = useMemo(() => {
    const needsConnection = reports.filter(
      (r) => r.status === "partial" || r.status === "blocked",
    ).length;
    return {
      ready:           reports.filter((r) => r.status === "ready").length,
      needsConnection,
      custom:          reports.filter((r) => r.source === "custom").length,
      connected:       reports.filter((r) => r.status === "ready" && r.source === "catalog").length,
      total:           reports.length,
    };
  }, [reports]);

  // Aucune app connectée si tous les rapports catalogue sont blocked
  const hasZeroConnectedApps = useMemo(
    () => reports.length > 0 && reports.filter((r) => r.source === "catalog").every((r) => r.status === "blocked"),
    [reports],
  );

  // ── Filtered list ───────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = reports;
    if (domainFilter !== "all") list = list.filter((r) => r.domain === domainFilter);
    if (statusFilter === "ready") list = list.filter((r) => r.status === "ready");
    if (statusFilter === "needs-connection")
      list = list.filter((r) => r.status === "partial" || r.status === "blocked");
    if (statusFilter === "custom") list = list.filter((r) => r.source === "custom");
    return list;
  }, [reports, domainFilter, statusFilter]);

  // Liste séparée des custom specs (pour la section "Vos rapports").
  const customReports = useMemo(
    () => reports.filter((r) => r.source === "custom"),
    [reports],
  );

  // ── Subtitle text ────────────────────────────────────────────

  const subtitle = loading
    ? "Chargement…"
    : error
      ? "Erreur de chargement"
      : `${counts.total} disponible${counts.total > 1 ? "s" : ""} · ${counts.ready} prêt${counts.ready > 1 ? "s" : ""} · ${counts.needsConnection} à connecter${counts.custom > 0 ? ` · ${counts.custom} personnalisé${counts.custom > 1 ? "s" : ""}` : ""}`;

  return (
    <div
      data-testid="reports-page"
      className="flex-1 flex flex-col min-h-0 overflow-auto"
      style={{ background: "var(--bg-center)", color: "var(--text)" }}
    >
      <PageHeader title="Rapports" subtitle={subtitle} />
      <div className="flex flex-col gap-8 px-12 py-8 w-full" style={{ maxWidth: "var(--width-center-max)", margin: "0 auto" }}>

        {/* ── CTA Créer un rapport ────────────────────────── */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => router.push("/reports/studio")}
            data-testid="reports-create-cta"
            className="inline-flex items-center gap-2 px-4 py-2 t-12 font-semibold rounded-md transition-all"
            style={{
              background: "var(--cykan)",
              color: "var(--text-on-cykan)",
              borderRadius: "var(--radius-sm)",
              transitionDuration: "var(--duration-base)",
            }}
          >
            + Créer un rapport
          </button>
        </div>

        {/* ── Filters ────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          {/* Status toggle */}
          <div className="flex items-center gap-1 flex-wrap">
            {STATUS_FILTERS.map(({ value, label }) => {
              const isActive = statusFilter === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  data-testid={`filter-status-${value}`}
                  className="px-3 py-1.5 t-12 font-medium rounded-md border transition-all"
                  style={{
                    background: isActive ? "var(--cykan-bg-active)" : "var(--surface-1)",
                    color: isActive ? "var(--cykan)" : "var(--text-muted)",
                    borderColor: isActive ? "var(--cykan-border)" : "var(--border-subtle)",
                    borderRadius: "var(--radius-md)",
                    transitionDuration: "var(--duration-base)",
                    transitionTimingFunction: "var(--ease-standard)",
                  }}
                >
                  {label}
                  {value === "ready" && counts.ready > 0 && (
                    <span className="ml-1.5 t-9 font-mono" style={{ color: isActive ? "var(--cykan)" : "var(--text-ghost)" }}>
                      {counts.ready}
                    </span>
                  )}
                  {value === "needs-connection" && counts.needsConnection > 0 && (
                    <span className="ml-1.5 t-9 font-mono" style={{ color: isActive ? "var(--cykan)" : "var(--text-ghost)" }}>
                      {counts.needsConnection}
                    </span>
                  )}
                  {value === "custom" && counts.custom > 0 && (
                    <span className="ml-1.5 t-9 font-mono" style={{ color: isActive ? "var(--cykan)" : "var(--text-ghost)" }}>
                      {counts.custom}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Domain pills */}
          <div className="flex items-center gap-1 flex-wrap">
            {ALL_DOMAINS.map(({ value, label }) => {
              const isActive = domainFilter === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDomainFilter(value)}
                  data-testid={`filter-domain-${value}`}
                  className="px-2.5 py-1 t-9 font-medium tracking-wide uppercase rounded-md transition-all"
                  style={{
                    background: isActive ? "var(--cykan-surface)" : "transparent",
                    color: isActive ? "var(--cykan)" : "var(--text-ghost)",
                    borderRadius: "var(--radius-xs)",
                    transitionDuration: "var(--duration-base)",
                    transitionTimingFunction: "var(--ease-standard)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────── */}

        {/* Loading */}
        {loading && <SkeletonGrid />}

        {/* Error */}
        {!loading && error && (
          <div
            className="flex flex-col items-center gap-4 py-16 text-center"
            data-testid="reports-error"
          >
            <p className="t-13 font-light" style={{ color: "var(--color-error)" }}>
              {error}
            </p>
            <button
              type="button"
              onClick={fetchReports}
              className="inline-flex items-center gap-2 px-4 py-2 t-12 font-medium rounded-md border transition-all"
              style={{
                background: "var(--surface-1)",
                color: "var(--text-muted)",
                borderColor: "var(--border-default)",
                borderRadius: "var(--radius-sm)",
                transitionDuration: "var(--duration-base)",
              }}
            >
              <RefreshIcon />
              Réessayer
            </button>
          </div>
        )}

        {/* Sub-banner onboarding non-bloquant — affiché si zéro app connectée
            mais le catalogue reste visible en dessous (CTA "Connecter" sur
            chaque carte). */}
        {!loading && !error && hasZeroConnectedApps && (
          <div
            className="flex items-center gap-4 p-4 rounded-md border"
            data-testid="reports-onboarding-banner"
            style={{
              background: "var(--cykan-surface)",
              borderColor: "var(--cykan-border)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <div style={{ color: "var(--cykan)" }}>
              <PlugIcon />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <p className="t-13 font-semibold" style={{ color: "var(--text)" }}>
                Connectez une première app pour activer ces rapports
              </p>
              <p className="t-12 font-light" style={{ color: "var(--text-muted)" }}>
                Les rapports ci-dessous attendent qu&apos;au moins une app soit liée — explorez le catalogue, lisez les pré-requis, puis connectez les sources nécessaires.
              </p>
            </div>
            <a
              href="/apps"
              className="inline-flex items-center gap-2 px-4 py-2 t-12 font-semibold rounded-md transition-all shrink-0"
              style={{
                background: "var(--cykan)",
                color: "var(--text-on-cykan)",
                borderRadius: "var(--radius-sm)",
                transitionDuration: "var(--duration-base)",
              }}
            >
              Connecter une app
            </a>
          </div>
        )}

        {/* Empty — filtre actif sans résultats */}
        {!loading && !error && reports.length > 0 && filtered.length === 0 && (
          <div
            className="flex flex-col items-center gap-4 py-16 text-center"
            data-testid="reports-empty-filtered"
          >
            <p className="t-13 font-light" style={{ color: "var(--text-faint)" }}>
              Aucun rapport dans cette catégorie.
            </p>
            <button
              type="button"
              onClick={() => { setDomainFilter("all"); setStatusFilter("all"); }}
              className="t-12 font-medium transition-colors"
              style={{
                color: "var(--cykan)",
                transitionDuration: "var(--duration-base)",
              }}
            >
              Réinitialiser les filtres
            </button>
          </div>
        )}

        {/* Section : Vos rapports (custom specs) */}
        {!loading && !error && customReports.length > 0 && statusFilter !== "ready" && statusFilter !== "needs-connection" && (
          <section className="flex flex-col gap-3" data-testid="reports-custom-section">
            <h2
              className="t-9 font-mono uppercase"
              style={{
                color: "var(--text-muted)",
                letterSpacing: "var(--tracking-display)",
              }}
            >
              Vos rapports
            </h2>
            <div
              className="grid gap-4"
              data-testid="reports-custom-grid"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
            >
              {customReports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  onLaunch={() => router.push(`/reports/studio?edit=${report.id}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Grid */}
        {!loading && !error && filtered.length > 0 && (
          <div
            className="grid gap-4"
            data-testid="reports-grid"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
          >
            {filtered.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
