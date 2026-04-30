"use client";

/**
 * /marketplace — browse des templates publics partagés.
 *
 * Filtres : kind (workflow / report_spec / persona / all), search, featured.
 * Grid responsive 1/2/3 colonnes.
 */

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { MarketplaceTemplateCard } from "../components/marketplace/MarketplaceTemplateCard";
import type { MarketplaceTemplateSummary } from "@/lib/marketplace/types";

type KindFilter = "all" | "workflow" | "report_spec" | "persona";

const KIND_TABS: ReadonlyArray<{ value: KindFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "workflow", label: "Workflows" },
  { value: "report_spec", label: "Rapports" },
  { value: "persona", label: "Personas" },
];

export default function MarketplacePage() {
  const [templates, setTemplates] = useState<MarketplaceTemplateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setTemplates(null);
    setError(null);

    const params = new URLSearchParams();
    if (kind !== "all") params.set("kind", kind);
    if (debouncedSearch) params.set("q", debouncedSearch);
    params.set("limit", "60");

    void (async () => {
      try {
        const res = await fetch(`/api/v2/marketplace/templates?${params.toString()}`, {
          credentials: "include",
        });
        if (cancelled) return;
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          setTemplates([]);
          return;
        }
        const body = (await res.json()) as { templates: MarketplaceTemplateSummary[] };
        if (!cancelled) setTemplates(body.templates ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "fetch_failed");
          setTemplates([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kind, debouncedSearch]);

  const isLoading = templates === null;
  const isEmpty = !isLoading && templates.length === 0;

  const featured = useMemo(
    () => (templates ?? []).filter((t) => t.isFeatured),
    [templates],
  );
  const others = useMemo(
    () => (templates ?? []).filter((t) => !t.isFeatured),
    [templates],
  );

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-bg text-text">
      <PageHeader
        title="Marketplace"
        subtitle="Templates communautaires — workflows, rapports, personas. Clone en un clic."
      />

      <div
        className="px-12 py-8 mx-auto w-full max-w-[min(100%,var(--width-actions))] flex flex-col"
        style={{ gap: "var(--space-6)" }}
      >
        {/* Filters */}
        <section
          className="flex flex-wrap items-center justify-between"
          style={{ gap: "var(--space-3)" }}
        >
          <div
            data-testid="marketplace-kind-tabs"
            className="flex flex-wrap"
            style={{ gap: "var(--space-1)" }}
          >
            {KIND_TABS.map((tab) => {
              const active = tab.value === kind;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setKind(tab.value)}
                  data-testid={`kind-tab-${tab.value}`}
                  className="t-11 font-mono uppercase tracking-marquee transition-colors"
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    color: active ? "var(--text)" : "var(--text-ghost)",
                    background: active ? "var(--cykan-surface)" : "transparent",
                    border: `1px solid ${active ? "var(--cykan)" : "var(--line-strong)"}`,
                    borderRadius: "var(--radius-pill)",
                    cursor: "pointer",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex" style={{ gap: "var(--space-2)" }}>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un template…"
              data-testid="marketplace-search"
              className="t-11 text-[var(--text)] focus:outline-none"
              style={{
                padding: "var(--space-2) var(--space-3)",
                background: "var(--surface-1)",
                border: "1px solid var(--line-strong)",
                borderRadius: "var(--radius-sm)",
                minWidth: "var(--space-32)",
              }}
            />
          </div>
        </section>

        {error && (
          <p
            className="t-11 font-mono uppercase tracking-marquee"
            style={{ color: "var(--danger)" }}
          >
            Erreur : {error}
          </p>
        )}

        {isLoading ? (
          <p className="t-11 font-mono uppercase tracking-marquee text-[var(--text-ghost)]">
            Chargement…
          </p>
        ) : isEmpty ? (
          <div
            className="flex flex-col items-center justify-center text-center"
            style={{
              gap: "var(--space-3)",
              padding: "var(--space-12)",
              border: "1px dashed var(--line-strong)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <p className="t-15 font-light text-[var(--text-soft)]">
              Aucun template trouvé
            </p>
            <p className="t-11 text-[var(--text-muted)]">
              Sois le premier à publier — depuis le Studio, le Builder ou la
              page Personas.
            </p>
          </div>
        ) : (
          <>
            {featured.length > 0 && (
              <section className="flex flex-col" style={{ gap: "var(--space-3)" }}>
                <h2 className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">
                  Featured
                </h2>
                <Grid templates={featured} />
              </section>
            )}
            <section className="flex flex-col" style={{ gap: "var(--space-3)" }}>
              {featured.length > 0 && (
                <h2 className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
                  Tous les templates
                </h2>
              )}
              <Grid templates={others} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Grid({ templates }: { templates: MarketplaceTemplateSummary[] }) {
  return (
    <div
      data-testid="marketplace-grid"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
      style={{ gap: "var(--space-3)" }}
    >
      {templates.map((t) => (
        <MarketplaceTemplateCard key={t.id} template={t} />
      ))}
    </div>
  );
}
