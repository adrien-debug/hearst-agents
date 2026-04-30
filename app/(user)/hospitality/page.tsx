"use client";

/**
 * Page /hospitality — overview vertical hôtellerie.
 *
 * Affiche les reports recommandés (3 specs hospitality), les workflow
 * templates verticaux (2 templates) et un raccourci vers la persona
 * "Hospitality Concierge". Sert de hub d'entrée pour le mode vertical.
 */

import Link from "next/link";
import { PageHeader } from "../components/PageHeader";

const HOSPITALITY_REPORTS = [
  {
    id: "00000000-0000-4000-8000-700000000001",
    title: "Daily Briefing — Hospitality",
    description:
      "Occupancy, ADR/RevPAR, arrivées + départs du jour, VIP guests et service requests pending.",
  },
  {
    id: "00000000-0000-4000-8000-700000000002",
    title: "RevPAR & ADR — Hospitality",
    description:
      "RevPAR, ADR, occupancy détaillés sur 30 jours et segmentation revenue par source.",
  },
  {
    id: "00000000-0000-4000-8000-700000000003",
    title: "Guest Satisfaction — Hospitality",
    description:
      "NPS par canal, reviews aggregées, complaints et taux de recovery sur 7 jours.",
  },
];

const HOSPITALITY_WORKFLOWS = [
  {
    id: "hospitality-guest-arrival-prep",
    name: "Préparation arrivées VIP",
    description:
      "Cron 10h → arrivées du jour → filtre VIP → welcome notes (Claude) → approval → Slack #frontdesk",
  },
  {
    id: "hospitality-service-request-dispatch",
    name: "Dispatch service request",
    description:
      "Webhook → classify priority (Haiku) → urgent? alert manager : routing standard → update PMS → ticket",
  },
];

export default function HospitalityPage() {
  return (
    <div
      className="flex-1 flex flex-col min-h-0"
      style={{ background: "var(--bg)" }}
    >
      <PageHeader
        title="Hospitality"
        subtitle="Cockpit IA pour l'hôtellerie haut de gamme — pilotage occupancy, RevPAR, guests et service."
        breadcrumb={[{ label: "Hearst", href: "/" }, { label: "Hospitality" }]}
      />

      <div
        className="flex flex-col"
        style={{
          padding: "var(--space-8) var(--space-12) var(--space-14)",
          gap: "var(--space-12)",
        }}
      >
        <Section
          label="Reports recommandés"
          meta="3 specs"
        >
          <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
            {HOSPITALITY_REPORTS.map((r) => (
              <Link
                key={r.id}
                href={`/reports?spec=${r.id}`}
                className="card-depth flex flex-col"
                style={{
                  padding: "var(--space-5)",
                  gap: "var(--space-2)",
                  textDecoration: "none",
                }}
              >
                <span
                  className="t-15"
                  style={{ color: "var(--text-l0)", fontWeight: 500 }}
                >
                  {r.title}
                </span>
                <span className="t-13" style={{ color: "var(--text-l2)" }}>
                  {r.description}
                </span>
              </Link>
            ))}
          </div>
        </Section>

        <Section label="Workflows clé en main" meta="2 templates">
          <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
            {HOSPITALITY_WORKFLOWS.map((w) => (
              <Link
                key={w.id}
                href={`/missions?template=${w.id}`}
                className="card-depth flex flex-col"
                style={{
                  padding: "var(--space-5)",
                  gap: "var(--space-2)",
                  textDecoration: "none",
                }}
              >
                <span
                  className="t-15"
                  style={{ color: "var(--text-l0)", fontWeight: 500 }}
                >
                  {w.name}
                </span>
                <span className="t-13" style={{ color: "var(--text-l2)" }}>
                  {w.description}
                </span>
              </Link>
            ))}
          </div>
        </Section>

        <Section label="Persona dédiée">
          <Link
            href="/personas?builtin=hospitality-concierge"
            className="card-depth flex flex-col"
            style={{
              padding: "var(--space-5)",
              gap: "var(--space-2)",
              textDecoration: "none",
            }}
          >
            <span
              className="t-15"
              style={{ color: "var(--text-l0)", fontWeight: 500 }}
            >
              Hospitality Concierge
            </span>
            <span className="t-13" style={{ color: "var(--text-l2)" }}>
              Voix éditoriale calibrée hôtelier — chaleureuse, discrète, vocabulaire
              métier (guest, room, VIP, ADR, RevPAR), anticipe les besoins.
            </span>
          </Link>
        </Section>

        <Section label="État des connecteurs">
          <div
            className="card-depth flex flex-col"
            style={{
              padding: "var(--space-5)",
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
              PMS · POS · Guest messaging
            </span>
            <p className="t-13" style={{ color: "var(--text-l2)" }}>
              Aucun connecteur hospitality natif pour MVP. Les KPIs et tables
              affichés ailleurs sont des données démo. Contacte ton commercial
              pour brancher Mews, Cloudbeds, Opera ou Hotelogix.
            </p>
          </div>
        </Section>
      </div>
    </div>
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
