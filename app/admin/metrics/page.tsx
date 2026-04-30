"use client";

/**
 * Page /admin/metrics — Tableau de bord LLM + Circuit Breakers + Webhooks.
 *
 * Refresh automatique toutes les 30 secondes.
 * RBAC délégué au layout admin (session requise) + API (requireAdmin).
 */

import { useEffect, useState, useCallback } from "react";
import type { MetricsSnapshot, ProviderMetrics, CircuitBreakerEntry } from "@/lib/llm/metrics";
import type { CustomWebhook } from "@/lib/webhooks/types";
import type { CircuitState } from "@/lib/llm/circuit-breaker";
import type { VitalsSnapshot, VitalName, VitalRating } from "@/lib/monitoring/web-vitals-store";

// ---------------------------------------------------------------------------
// Types locaux
// ---------------------------------------------------------------------------

interface WebhooksPayload {
  webhooks: CustomWebhook[];
}

interface CircuitBreakerDisplayEntry {
  provider: string;
  state: CircuitState;
  failures: number;
  nextRetryAt?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 30_000;

function fmtMs(ms: number | null): string {
  if (ms === null) return "—";
  return `${Math.round(ms)} ms`;
}

function fmtPct(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(1)} %`;
}

function fmtUsd(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

function maskUrl(url: string): string {
  if (url.length <= 20) return url;
  return url.slice(0, 20) + "…";
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return "jamais";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `il y a ${diff}s`;
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
  return `il y a ${Math.floor(diff / 3600)}h`;
}

function timeSinceMs(ms: number | null): string {
  if (ms === null) return "—";
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  return `${Math.floor(diff / 3600)}h`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "cykan" | "warn" | "danger";
}) {
  const accentClass =
    accent === "cykan"
      ? "text-(--cykan)"
      : accent === "warn"
        ? "text-(--warn)"
        : accent === "danger"
          ? "text-(--danger)"
          : "text-text";

  return (
    <div className="rounded-(--radius-md) bg-surface-1 border border-(--border-shell) p-(--space-4) flex flex-col gap-(--space-2)">
      <span className="t-10 text-text-ghost uppercase tracking-(--tracking-stretch)">{label}</span>
      <span className={`t-24 font-light ${accentClass}`}>{value}</span>
      {sub && <span className="t-10 text-text-faint">{sub}</span>}
    </div>
  );
}

function CircuitBadge({ state }: { state: CircuitState }) {
  const cls =
    state === "CLOSED"
      ? "bg-(--cykan)/15 text-(--cykan)"
      : state === "OPEN"
        ? "bg-(--danger)/15 text-(--danger)"
        : "bg-(--warn)/15 text-(--warn)";

  return (
    <span
      className={`t-10 px-(--space-2) py-[2px] rounded-pill font-medium uppercase ${cls}`}
    >
      {state}
    </span>
  );
}

function WebhookStatusBadge({ status }: { status: "success" | "failed" | undefined }) {
  if (!status) return <span className="t-10 text-text-ghost">—</span>;
  const cls =
    status === "success"
      ? "bg-(--cykan)/15 text-(--cykan)"
      : "bg-(--danger)/15 text-(--danger)";
  return (
    <span className={`t-10 px-(--space-2) py-[2px] rounded-pill font-medium uppercase ${cls}`}>
      {status}
    </span>
  );
}

function VitalRatingBadge({ rating }: { rating: VitalRating }) {
  const cls =
    rating === "good"
      ? "bg-(--cykan)/15 text-(--cykan)"
      : rating === "needs-improvement"
        ? "bg-(--warn)/15 text-(--warn)"
        : "bg-(--danger)/15 text-(--danger)";
  const label =
    rating === "good" ? "BON" : rating === "needs-improvement" ? "À AMÉLIORER" : "MAUVAIS";
  return (
    <span className={`t-10 px-(--space-2) py-[2px] rounded-pill font-medium uppercase ${cls}`}>
      {label}
    </span>
  );
}

// Table header row
function TableHeader({ cols }: { cols: string[] }) {
  return (
    <div
      className="grid px-(--space-4) py-(--space-2) t-10 text-text-ghost uppercase tracking-(--tracking-stretch) border-b border-(--border-shell)"
      style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}
    >
      {cols.map((c) => (
        <span key={c}>{c}</span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MetricsPage() {
  const [snapshot, setSnapshot] = useState<MetricsSnapshot | null>(null);
  const [webhooks, setWebhooks] = useState<CustomWebhook[]>([]);
  const [vitals, setVitals] = useState<VitalsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [metricsRes, whRes, vitalsRes] = await Promise.all([
        fetch("/api/admin/llm-metrics"),
        fetch("/api/admin/webhooks-status"),
        fetch("/api/admin/vitals"),
      ]);

      if (!metricsRes.ok) throw new Error(`LLM metrics: ${metricsRes.status}`);
      if (!whRes.ok) throw new Error(`Webhooks: ${whRes.status}`);

      const metricsData: MetricsSnapshot = await metricsRes.json();
      const whData: WebhooksPayload = await whRes.json();

      setSnapshot(metricsData);
      setWebhooks(whData.webhooks ?? []);
      if (vitalsRes.ok) {
        const vitalsData: VitalsSnapshot = await vitalsRes.json();
        setVitals(vitalsData);
      }
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  // ── Circuit breaker state — état réel lu depuis circuitBreakers du snapshot ──
  const circuitEntries: CircuitBreakerDisplayEntry[] = (snapshot?.providers ?? []).map(
    (p: ProviderMetrics) => {
      const cbEntry = snapshot?.circuitBreakers?.[p.provider];
      return {
        provider: p.provider,
        state: (cbEntry?.state ?? "CLOSED") as CircuitState,
        failures: cbEntry?.failures ?? 0,
        nextRetryAt: cbEntry?.nextRetryAt,
      };
    },
  );

  // ── KPIs globaux ────────────────────────────────────────────────────────
  const globalCacheHit =
    snapshot?.providers.find((p) => p.tokens.cacheHitRate !== null)?.tokens
      .cacheHitRate ?? null;

  const globalP95 = snapshot?.providers.reduce<number | null>((acc, p) => {
    if (p.latency.p95 === null) return acc;
    return acc === null ? p.latency.p95 : Math.max(acc, p.latency.p95);
  }, null) ?? null;

  const globalCost = snapshot?.providers.reduce(
    (acc, p) => acc + p.cost.totalUsd,
    0,
  ) ?? 0;

  const globalErrorRate =
    snapshot && snapshot.providers.length > 0
      ? snapshot.providers.reduce((acc, p) => acc + p.errorRate, 0) /
        snapshot.providers.length
      : null;

  // ── Temps depuis mise à jour ──────────────────────────────────────────
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsSinceUpdate(
        lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000) : 0,
      );
    }, 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  // ── Test webhook ──────────────────────────────────────────────────────
  async function handleTestWebhook(webhookId: string) {
    setTestingWebhook(webhookId);
    try {
      await fetch(`/api/webhooks/${webhookId}/test`, { method: "POST" });
    } catch {
      // Pas bloquant — juste un test ping
    } finally {
      setTestingWebhook(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      className="p-(--space-8) overflow-y-auto h-full"
      style={{ scrollbarWidth: "thin" }}
    >
      {/* En-tête */}
      <div className="flex items-center justify-between mb-(--space-8)">
        <h1 className="t-24 font-light text-text">Métriques système</h1>
        <button
          onClick={fetchAll}
          className="t-13 text-text-faint hover:text-text transition-colors px-(--space-3) py-(--space-1) rounded-(--radius-sm) border border-(--border-shell) hover:border-(--border-soft)"
        >
          Rafraîchir
        </button>
      </div>

      {/* Erreur globale */}
      {error && (
        <div className="rounded-(--radius-md) bg-(--danger)/10 border border-(--danger)/25 p-(--space-4) text-danger t-13 mb-(--space-8)">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-(--space-16)">
          <span className="t-13 text-text-ghost">Chargement…</span>
        </div>
      )}

      {!loading && snapshot && (
        <div className="space-y-(--space-8)">

          {/* ── Section 1 : KPIs LLM ─────────────────────────── */}
          <section>
            <h2 className="t-13 text-text-muted uppercase tracking-(--tracking-stretch) mb-(--space-4)">
              LLM — Vue globale
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-(--space-4)">
              <KpiCard
                label="Cache hit rate"
                value={fmtPct(globalCacheHit)}
                sub="Anthropic prompt cache"
                accent="cykan"
              />
              <KpiCard
                label="Latence p95"
                value={fmtMs(globalP95)}
                sub="pire provider"
              />
              <KpiCard
                label="Coût total"
                value={fmtUsd(globalCost)}
                sub="depuis démarrage"
                accent={globalCost > 1 ? "warn" : undefined}
              />
              <KpiCard
                label="Taux d'erreur"
                value={fmtPct(globalErrorRate)}
                sub="moyenne providers"
                accent={
                  globalErrorRate !== null && globalErrorRate > 0.1
                    ? "danger"
                    : undefined
                }
              />
            </div>
          </section>

          {/* ── Section 2 : Compteurs ────────────────────────── */}
          <section>
            <h2 className="t-13 text-text-muted uppercase tracking-(--tracking-stretch) mb-(--space-4)">
              Compteurs
            </h2>
            <div className="grid grid-cols-3 gap-(--space-4)">
              <KpiCard
                label="Circuit breaker trips"
                value={String(snapshot.counters.circuitBreakerTrips)}
                accent={snapshot.counters.circuitBreakerTrips > 0 ? "danger" : undefined}
              />
              <KpiCard
                label="Rate limit hits"
                value={String(snapshot.counters.rateLimitHits)}
                accent={snapshot.counters.rateLimitHits > 0 ? "warn" : undefined}
              />
              <KpiCard
                label="Tool loops détectés"
                value={String(snapshot.counters.toolLoopsDetected)}
                accent={snapshot.counters.toolLoopsDetected > 0 ? "warn" : undefined}
              />
            </div>
          </section>

          {/* ── Section 3 : Latences par provider ───────────── */}
          {snapshot.providers.length > 0 && (
            <section>
              <h2 className="t-13 text-text-muted uppercase tracking-(--tracking-stretch) mb-(--space-4)">
                Latences par provider (ms)
              </h2>
              <div className="rounded-(--radius-md) bg-surface-1 border border-(--border-shell) overflow-hidden">
                <TableHeader cols={["Provider", "Calls", "p50", "p95", "p99", "Erreurs"]} />
                {snapshot.providers.map((p) => (
                  <div
                    key={p.provider}
                    className="grid grid-cols-6 px-(--space-4) py-(--space-2) t-13 border-b border-line hover:bg-surface-2 transition-colors"
                  >
                    <span className="text-text font-medium">{p.provider}</span>
                    <span className="text-text-muted">{p.totalCalls}</span>
                    <span className="text-text-muted">{fmtMs(p.latency.p50)}</span>
                    <span className="text-text-muted">{fmtMs(p.latency.p95)}</span>
                    <span className="text-text-muted">{fmtMs(p.latency.p99)}</span>
                    <span
                      className={
                        p.errorRate > 0.1 ? "text-(--danger)" : "text-text-faint"
                      }
                    >
                      {p.totalErrors} ({fmtPct(p.errorRate)})
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Section 4 : Coûts par provider ──────────────── */}
          {snapshot.providers.length > 0 && (
            <section>
              <h2 className="t-13 text-text-muted uppercase tracking-(--tracking-stretch) mb-(--space-4)">
                Coûts par provider (USD)
              </h2>
              <div className="rounded-(--radius-md) bg-surface-1 border border-(--border-shell) overflow-hidden">
                <TableHeader cols={["Provider", "Total", "Moy / call", "Tokens IN", "Tokens OUT", "Cache hit"]} />
                {snapshot.providers.map((p) => (
                  <div
                    key={p.provider}
                    className="grid grid-cols-6 px-(--space-4) py-(--space-2) t-13 border-b border-line hover:bg-surface-2 transition-colors"
                  >
                    <span className="text-text font-medium">{p.provider}</span>
                    <span className="text-(--cykan)">{fmtUsd(p.cost.totalUsd)}</span>
                    <span className="text-text-muted">
                      {p.cost.avgPerCallUsd !== null
                        ? fmtUsd(p.cost.avgPerCallUsd)
                        : "—"}
                    </span>
                    <span className="text-text-muted">{p.tokens.totalIn.toLocaleString()}</span>
                    <span className="text-text-muted">{p.tokens.totalOut.toLocaleString()}</span>
                    <span className="text-text-muted">
                      {fmtPct(p.tokens.cacheHitRate)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Section 5 : Circuit Breaker ──────────────────── */}
          <section>
            <h2 className="t-13 text-text-muted uppercase tracking-(--tracking-stretch) mb-(--space-4)">
              Circuit Breaker — État par provider
            </h2>
            {circuitEntries.length === 0 ? (
              <p className="t-13 text-text-ghost">Aucun provider enregistré</p>
            ) : (
              <div className="flex flex-wrap gap-(--space-3)">
                {circuitEntries.map((entry) => (
                  <div
                    key={entry.provider}
                    className="rounded-(--radius-md) bg-surface-1 border border-(--border-shell) px-(--space-4) py-(--space-3) flex items-center gap-(--space-3)"
                  >
                    <span className="t-13 text-text-soft font-medium">{entry.provider}</span>
                    <CircuitBadge state={entry.state} />
                    {entry.failures > 0 && (
                      <span className="t-10 text-text-ghost">
                        {entry.failures} échec{entry.failures > 1 ? "s" : ""}
                      </span>
                    )}
                    {entry.state === "OPEN" && entry.nextRetryAt && (
                      <span className="t-10 text-(--warn)">
                        retry {relativeTime(entry.nextRetryAt)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Section 6 : Webhooks ─────────────────────────── */}
          <section>
            <h2 className="t-13 text-text-muted uppercase tracking-(--tracking-stretch) mb-(--space-4)">
              Webhooks custom
            </h2>
            {webhooks.length === 0 ? (
              <p className="t-13 text-text-ghost">Aucun webhook configuré</p>
            ) : (
              <div className="rounded-(--radius-md) bg-surface-1 border border-(--border-shell) overflow-hidden">
                {/* Header */}
                <div className="grid px-(--space-4) py-(--space-2) t-10 text-text-ghost uppercase tracking-(--tracking-stretch) border-b border-(--border-shell)"
                  style={{ gridTemplateColumns: "1fr 1fr 1fr auto auto auto" }}
                >
                  <span>Nom</span>
                  <span>URL</span>
                  <span>Événements</span>
                  <span>Dernier déclenchement</span>
                  <span>Statut</span>
                  <span></span>
                </div>
                {webhooks.map((wh) => (
                  <div
                    key={wh.id}
                    className="grid px-(--space-4) py-(--space-2) t-13 border-b border-line hover:bg-surface-2 transition-colors items-center"
                    style={{ gridTemplateColumns: "1fr 1fr 1fr auto auto auto" }}
                  >
                    <span className="text-text font-medium truncate">{wh.name}</span>
                    <span
                      className="text-text-faint font-mono t-10 truncate"
                      title={wh.url}
                    >
                      {maskUrl(wh.url)}
                    </span>
                    <span className="text-text-muted t-10 truncate">
                      {wh.events.join(", ")}
                    </span>
                    <span className="text-text-ghost t-10 whitespace-nowrap px-(--space-2)">
                      {relativeTime(wh.lastTriggeredAt)}
                    </span>
                    <span className="px-(--space-2)">
                      <WebhookStatusBadge status={wh.lastStatus} />
                    </span>
                    <span>
                      <button
                        onClick={() => handleTestWebhook(wh.id)}
                        disabled={testingWebhook === wh.id}
                        className="t-10 px-(--space-3) py-[2px] rounded-(--radius-sm) border border-(--border-shell) text-text-muted hover:text-text hover:border-(--cykan)/40 transition-colors disabled:opacity-40"
                      >
                        {testingWebhook === wh.id ? "…" : "Tester"}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Section 7 : Web Vitals ───────────────────────── */}
          <section>
            <h2 className="t-13 text-text-muted uppercase tracking-(--tracking-stretch) mb-(--space-4)">
              Web Vitals — Core Web Vitals (p75)
            </h2>
            {!vitals ? (
              <p className="t-13 text-text-ghost">Aucune mesure collectée — en attente de navigation client</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-(--space-4)">
                {(["LCP", "FCP", "INP", "CLS", "TTFB"] as VitalName[]).map((name) => {
                  const metric = vitals[name];
                  const formattedValue =
                    name === "CLS"
                      ? metric.p75.toFixed(3)
                      : metric.count === 0
                        ? "—"
                        : `${Math.round(metric.p75)} ms`;
                  return (
                    <div
                      key={name}
                      className="rounded-(--radius-md) bg-surface-1 border border-(--border-shell) p-(--space-4) flex flex-col gap-(--space-2)"
                    >
                      <span className="t-10 text-text-ghost uppercase tracking-(--tracking-stretch)">{name}</span>
                      <span className="t-24 font-light text-text">
                        {metric.count === 0 ? "—" : formattedValue}
                      </span>
                      <div className="flex items-center gap-(--space-2)">
                        {metric.count > 0 && <VitalRatingBadge rating={metric.rating} />}
                        <span className="t-10 text-text-faint">{metric.count} mesure{metric.count > 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      )}

      {/* Footer — indicateur de fraîcheur */}
      {lastUpdated && (
        <p className="mt-(--space-8) t-10 text-text-ghost text-right">
          Mis à jour il y a {secondsSinceUpdate}s — refresh auto toutes les 30s
        </p>
      )}
    </div>
  );
}
