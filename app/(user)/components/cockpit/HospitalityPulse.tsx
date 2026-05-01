"use client";

/**
 * HospitalityPulse — Section verticale du CockpitStage quand
 * `industry === "hospitality"`.
 *
 * Affiche les KPIs hospitality clés (occupancy, ADR, RevPAR) + arrivées VIP
 * du jour + service requests urgentes pending. Données mock tant qu'aucun
 * connecteur PMS — badge "demo" sur la section.
 */

import type { CockpitHospitalitySection } from "@/lib/cockpit/today";

interface HospitalityPulseProps {
  data: CockpitHospitalitySection;
}

export function HospitalityPulse({ data }: HospitalityPulseProps) {
  const isMock = data.source === "demo";
  const occPct = `${(data.occupancy * 100).toFixed(0)}%`;
  const occDelta = ((data.occupancyForecast - data.occupancy) * 100).toFixed(1);
  const occDeltaSign = Number(occDelta) >= 0 ? "+" : "";
  const adr = formatEuro(data.adr);
  const revpar = formatEuro(data.revpar);

  return (
    <section className="flex flex-col" style={{ gap: "var(--space-5)" }}>
      <header className="flex items-baseline justify-between">
        <span className="t-13 font-medium text-[var(--text-l1)]">
          Hospitality Pulse
        </span>
        {isMock && (
          <span className="t-9 font-light text-[var(--text-ghost)]">
            demo data
          </span>
        )}
      </header>

      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        style={{ gap: "var(--space-4)" }}
      >
        <KpiCard
          label="Occupancy"
          value={occPct}
          delta={`${occDeltaSign}${occDelta} pt forecast`}
        />
        <KpiCard label="ADR" value={adr} delta={null} />
        <KpiCard label="RevPAR" value={revpar} delta={null} />
        <KpiCard
          label="Service requests"
          value={String(data.pendingServiceRequests)}
          delta={`${data.urgentRequests.length} urgent`}
          deltaTone={data.urgentRequests.length > 0 ? "alert" : "neutral"}
        />
      </div>

      <div
        className="grid grid-cols-1 lg:grid-cols-2"
        style={{ gap: "var(--space-4)" }}
      >
        <InnerCard
          title="Arrivées VIP"
          empty={data.vipArrivals.length === 0}
          emptyText="Aucune arrivée VIP aujourd'hui."
        >
          <ul className="flex flex-col" style={{ gap: "var(--space-3)" }}>
            {data.vipArrivals.map((a) => (
              <li
                key={`${a.room}-${a.guestName}`}
                className="flex items-start justify-between"
                style={{ gap: "var(--space-3)" }}
              >
                <div className="flex flex-col" style={{ gap: "var(--space-1)" }}>
                  <span
                    className="t-13"
                    style={{ color: "var(--text-l0)", fontWeight: 500 }}
                  >
                    {a.guestName}
                  </span>
                  {a.specialRequest && (
                    <span
                      className="t-11"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {a.specialRequest}
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end" style={{ gap: "var(--space-1)" }}>
                  <span
                    className="t-11 font-mono"
                    style={{ color: "var(--cykan)" }}
                  >
                    Ch. {a.room}
                  </span>
                  <span
                    className="t-9 font-mono"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {a.eta}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </InnerCard>

        <InnerCard
          title="Requêtes urgentes"
          empty={data.urgentRequests.length === 0}
          emptyText="Aucune requête urgente en attente."
        >
          <ul className="flex flex-col" style={{ gap: "var(--space-3)" }}>
            {data.urgentRequests.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between"
                style={{ gap: "var(--space-3)" }}
              >
                <div className="flex flex-col" style={{ gap: "var(--space-1)" }}>
                  <span
                    className="t-13"
                    style={{ color: "var(--text-l0)", fontWeight: 500 }}
                  >
                    {r.guestName}
                  </span>
                  <span
                    className="t-11"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {r.text}
                  </span>
                </div>
                <div className="flex flex-col items-end" style={{ gap: "var(--space-1)" }}>
                  <span
                    className="t-11 font-mono"
                    style={{ color: "var(--cykan)" }}
                  >
                    Ch. {r.room}
                  </span>
                  <span className="t-9 font-light text-[var(--text-faint)]">
                    {r.type}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </InnerCard>
      </div>
    </section>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  delta: string | null;
  deltaTone?: "neutral" | "alert";
}

function KpiCard({ label, value, delta, deltaTone = "neutral" }: KpiCardProps) {
  return (
    <div
      className="card-depth flex flex-col text-left w-full"
      style={{ padding: "var(--space-5)", gap: "var(--space-4)" }}
    >
      <span className="t-11 font-medium text-[var(--text-faint)]">
        {label}
      </span>
      <div
        className="flex items-baseline justify-between"
        style={{ gap: "var(--space-3)" }}
      >
        <span
          className="t-28"
          style={{
            fontWeight: 500,
            letterSpacing: "var(--tracking-tight)",
            color: "var(--text-l0)",
          }}
        >
          {value}
        </span>
        {delta && (
          <span
            className="t-11 font-mono"
            style={{
              color:
                deltaTone === "alert" ? "var(--warn)" : "var(--text-faint)",
            }}
          >
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

interface InnerCardProps {
  title: string;
  empty?: boolean;
  emptyText?: string;
  children: React.ReactNode;
}

function InnerCard({ title, empty, emptyText, children }: InnerCardProps) {
  return (
    <div
      className="card-depth flex flex-col"
      style={{ padding: "var(--space-5)", gap: "var(--space-4)" }}
    >
      <span className="t-11 font-medium text-[var(--text-faint)]">
        {title}
      </span>
      {empty ? (
        <span className="t-13" style={{ color: "var(--text-ghost)" }}>
          {emptyText}
        </span>
      ) : (
        children
      )}
    </div>
  );
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
