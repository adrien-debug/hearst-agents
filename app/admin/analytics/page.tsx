"use client";

/**
 * /admin/analytics — Dashboard cross-tenant (C6).
 *
 * Vue cross-tenant : runs, cost USD, missions, assets, users actifs.
 * Filtres : range (last 7d/30d/90d), granularité, kind. Top 10 tenants par
 * usage, drill-down user-by-user au clic sur un tenant.
 *
 * Auth : layout admin requis (déjà en place dans app/admin/layout.tsx).
 * Tokens uniquement.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnalyticsKpiCard } from "../_components/AnalyticsKpiCard";
import { UsageTimeSeriesChart } from "../_components/UsageTimeSeriesChart";
import { TenantsTable } from "../_components/TenantsTable";
import type {
  TenantUsage,
  TimeSeriesPoint,
  UsageOverview,
  Granularity,
  DateRange,
} from "@/lib/admin/usage/aggregate";

type RangePreset = "7d" | "30d" | "90d";

const KIND_OPTIONS = [
  { value: "", label: "tous kinds" },
  { value: "chat", label: "chat" },
  { value: "research", label: "research" },
  { value: "mission", label: "mission" },
  { value: "tool", label: "tool" },
];

function buildRange(preset: RangePreset): DateRange {
  const end = new Date();
  const start = new Date(end);
  const days = preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
  start.setUTCDate(start.getUTCDate() - days);
  start.setUTCHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

interface UsageResponse {
  range: DateRange;
  granularity: Granularity;
  kind: string | null;
  overview: UsageOverview;
  timeSeries: TimeSeriesPoint[];
}

interface TenantsResponse {
  range: DateRange;
  kind: string | null;
  top: TenantUsage[];
}

interface TenantDetailResponse {
  range: DateRange;
  tenant: TenantUsage & {
    users: Array<{ userId: string; runs: number; costUsd: number }>;
  };
}

export default function AdminAnalyticsPage() {
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [kind, setKind] = useState("");
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [tenants, setTenants] = useState<TenantUsage[] | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);
  const [tenantDetail, setTenantDetail] = useState<TenantDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => buildRange(preset), [preset]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          start: range.start,
          end: range.end,
          granularity,
        });
        if (kind) params.set("kind", kind);
        const [usageRes, tenantsRes] = await Promise.all([
          fetch(`/api/admin/analytics/usage?${params.toString()}`, {
            credentials: "include",
          }),
          fetch(`/api/admin/analytics/tenants?${params.toString()}&limit=10`, {
            credentials: "include",
          }),
        ]);
        if (cancelled) return;
        if (!usageRes.ok) throw new Error(`usage_${usageRes.status}`);
        if (!tenantsRes.ok) throw new Error(`tenants_${tenantsRes.status}`);
        const usageJson = (await usageRes.json()) as UsageResponse;
        const tenantsJson = (await tenantsRes.json()) as TenantsResponse;
        if (cancelled) return;
        setUsage(usageJson);
        setTenants(tenantsJson.top);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "load_failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, granularity, kind]);

  const loadTenantDetail = useCallback(
    async (tenantId: string) => {
      setSelectedTenant(tenantId);
      const params = new URLSearchParams({
        start: range.start,
        end: range.end,
        tenantId,
      });
      if (kind) params.set("kind", kind);
      try {
        const res = await fetch(
          `/api/admin/analytics/tenants?${params.toString()}`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error(`detail_${res.status}`);
        const data = (await res.json()) as TenantDetailResponse;
        setTenantDetail(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "detail_failed");
      }
    },
    [range.start, range.end, kind],
  );

  const overview = usage?.overview ?? null;

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-bg text-text">
      <div
        className="mx-auto w-full max-w-[min(100%,var(--width-actions))] flex flex-col"
        style={{
          gap: "var(--space-6)",
          padding: "var(--space-8) var(--space-12)",
        }}
      >
        <header className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <p className="t-10 font-mono uppercase tracking-(--tracking-stretch) text-[var(--text-faint)]">
            Hearst OS · admin
          </p>
          <h1 className="t-28 font-light tracking-tight text-[var(--text)]">
            Analytics cross-tenant
          </h1>
          <p className="t-13 text-[var(--text-muted)]">
            Usage agrégé par tenant : runs, cost LLM, missions, assets et users
            actifs. Source : table runs (cost_usd) + missions + assets sur la
            fenêtre choisie.
          </p>
        </header>

        <Filters
          preset={preset}
          onPreset={setPreset}
          granularity={granularity}
          onGranularity={setGranularity}
          kind={kind}
          onKind={setKind}
          loading={loading}
        />

        {error && (
          <p className="t-11 font-mono uppercase tracking-marquee text-[var(--danger)]">
            {error}
          </p>
        )}

        <section
          className="grid grid-cols-2 lg:grid-cols-4"
          style={{ gap: "var(--space-3)" }}
        >
          <AnalyticsKpiCard
            label="Runs"
            value={(overview?.totalRuns ?? 0).toLocaleString("en-US")}
            sub={`${overview?.totalTenants ?? 0} tenant(s)`}
          />
          <AnalyticsKpiCard
            label="Cost USD"
            value={`$${(overview?.totalCostUsd ?? 0).toFixed(4)}`}
            accent="cykan"
            sub={`${overview?.totalActiveUsers ?? 0} user(s) actif(s)`}
          />
          <AnalyticsKpiCard
            label="Missions"
            value={(overview?.totalMissions ?? 0).toLocaleString("en-US")}
            sub="créées sur la fenêtre"
          />
          <AnalyticsKpiCard
            label="Assets"
            value={(overview?.totalAssets ?? 0).toLocaleString("en-US")}
            sub={`${(overview?.totalTokensIn ?? 0).toLocaleString("en-US")} in / ${(overview?.totalTokensOut ?? 0).toLocaleString("en-US")} out`}
          />
        </section>

        <UsageTimeSeriesChart points={usage?.timeSeries ?? []} />

        <section className="flex flex-col" style={{ gap: "var(--space-3)" }}>
          <h2 className="t-15 font-medium text-[var(--text)]">Top tenants</h2>
          {tenants ? (
            <TenantsTable
              tenants={tenants}
              selectedId={selectedTenant}
              onSelect={loadTenantDetail}
            />
          ) : (
            <p className="t-11 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
              Chargement…
            </p>
          )}
        </section>

        {tenantDetail && (
          <TenantDrillDown
            detail={tenantDetail}
            onClose={() => {
              setSelectedTenant(null);
              setTenantDetail(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function Filters({
  preset,
  onPreset,
  granularity,
  onGranularity,
  kind,
  onKind,
  loading,
}: {
  preset: RangePreset;
  onPreset: (v: RangePreset) => void;
  granularity: Granularity;
  onGranularity: (v: Granularity) => void;
  kind: string;
  onKind: (v: string) => void;
  loading: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center"
      style={{ gap: "var(--space-3)" }}
    >
      <SegmentedControl
        label="Range"
        value={preset}
        onChange={(v) => onPreset(v as RangePreset)}
        options={[
          { value: "7d", label: "7j" },
          { value: "30d", label: "30j" },
          { value: "90d", label: "90j" },
        ]}
      />
      <SegmentedControl
        label="Granularité"
        value={granularity}
        onChange={(v) => onGranularity(v as Granularity)}
        options={[
          { value: "day", label: "jour" },
          { value: "week", label: "semaine" },
          { value: "month", label: "mois" },
        ]}
      />
      <label className="flex items-center" style={{ gap: "var(--space-2)" }}>
        <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
          Kind
        </span>
        <select
          value={kind}
          onChange={(e) => onKind(e.target.value)}
          className="t-13 text-[var(--text)] focus:outline-none"
          style={{
            padding: "var(--space-2) var(--space-3)",
            border: "1px solid var(--line-strong)",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-elev)",
          }}
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {loading && (
        <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">
          chargement…
        </span>
      )}
    </div>
  );
}

function SegmentedControl({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
      <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
        {label}
      </span>
      <div
        className="flex"
        style={{
          gap: "var(--space-1)",
          padding: "var(--space-1)",
          border: "1px solid var(--line-strong)",
          borderRadius: "var(--radius-pill)",
          background: "var(--bg-elev)",
        }}
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className="t-11 font-mono uppercase tracking-marquee transition-colors"
              style={{
                padding: "var(--space-1) var(--space-3)",
                borderRadius: "var(--radius-pill)",
                background: active ? "var(--cykan-surface)" : "transparent",
                color: active ? "var(--cykan)" : "var(--text-ghost)",
                border: "none",
                cursor: "pointer",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TenantDrillDown({
  detail,
  onClose,
}: {
  detail: TenantDetailResponse;
  onClose: () => void;
}) {
  const t = detail.tenant;
  return (
    <section
      className="flex flex-col"
      style={{
        gap: "var(--space-3)",
        padding: "var(--space-5)",
        border: "1px solid var(--cykan-border)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-elev)",
      }}
    >
      <header
        className="flex items-baseline justify-between"
        style={{ gap: "var(--space-3)" }}
      >
        <h2 className="t-15 font-medium text-[var(--text)]">
          Drill-down : {t.tenantId}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="t-9 font-mono uppercase tracking-marquee text-[var(--text-ghost)] hover:text-[var(--cykan)]"
          style={{ background: "transparent", border: "none", cursor: "pointer" }}
        >
          Fermer
        </button>
      </header>
      <div
        className="grid grid-cols-2 md:grid-cols-4"
        style={{ gap: "var(--space-3)" }}
      >
        <Mini label="Runs" value={t.totalRuns.toString()} />
        <Mini label="Cost USD" value={`$${t.totalCostUsd.toFixed(4)}`} />
        <Mini label="Missions" value={t.totalMissions.toString()} />
        <Mini label="Active users" value={t.activeUsers.toString()} />
      </div>
      <h3 className="t-13 font-medium text-[var(--text)]">Top users</h3>
      {t.users.length === 0 ? (
        <p className="t-11 text-[var(--text-muted)]">
          Aucun user actif sur cette fenêtre.
        </p>
      ) : (
        <ul className="flex flex-col" style={{ gap: "var(--space-1)" }}>
          {t.users.slice(0, 20).map((u) => (
            <li
              key={u.userId}
              className="grid grid-cols-12 items-center"
              style={{
                padding: "var(--space-2) var(--space-3)",
                borderBottom: "1px solid var(--line-strong)",
                gap: "var(--space-3)",
              }}
            >
              <span className="col-span-7 t-11 font-mono text-[var(--text-soft)] truncate">
                {u.userId}
              </span>
              <span className="col-span-2 text-right t-11 font-mono text-[var(--text-muted)]">
                {u.runs} runs
              </span>
              <span className="col-span-3 text-right t-11 font-mono text-[var(--cykan)]">
                ${u.costUsd.toFixed(4)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-col"
      style={{
        gap: "var(--space-1)",
        padding: "var(--space-3)",
        border: "1px solid var(--line-strong)",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-1)",
      }}
    >
      <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
        {label}
      </span>
      <span className="t-15 font-medium text-[var(--text)]">{value}</span>
    </div>
  );
}
