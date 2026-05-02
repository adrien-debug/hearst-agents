"use client";

/**
 * /onboarding/vertical — sélection vertical industriel par le user.
 *
 * 6 cartes (general / hospitality / saas / ecommerce / finance / healthcare).
 * Submit → POST /api/onboarding/set-industry → redirect /.
 *
 * Accessible directement via URL — pas de auto-redirect depuis layout
 * (volontairement light pour ne pas casser les flows existants).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../components/PageHeader";
import { toast } from "@/app/hooks/use-toast";

type Industry =
  | "general"
  | "hospitality"
  | "saas"
  | "ecommerce"
  | "finance"
  | "healthcare";

interface IndustryCard {
  id: Industry;
  name: string;
  description: string;
  icon: string;
}

const INDUSTRIES: IndustryCard[] = [
  {
    id: "general",
    name: "Général",
    description: "Cockpit polyvalent, pas de spécialisation métier.",
    icon: "/icons/services/general.svg",
  },
  {
    id: "hospitality",
    name: "Hôtellerie",
    description: "Guests, ADR, RevPAR, occupancy. Persona concierge intégrée.",
    icon: "/icons/services/google-calendar.svg",
  },
  {
    id: "saas",
    name: "SaaS",
    description: "MRR, ARR, churn, expansion. CRM + dev tools first-class.",
    icon: "/icons/services/github.svg",
  },
  {
    id: "ecommerce",
    name: "E-commerce",
    description: "GMV, AOV, conversion, stock. Stripe + Shopify + Airtable.",
    icon: "/icons/services/stripe.svg",
  },
  {
    id: "finance",
    name: "Finance",
    description: "P&L, cash flow, KPIs trésorerie. Notion + Excel + Stripe.",
    icon: "/icons/services/stripe.svg",
  },
  {
    id: "healthcare",
    name: "Santé",
    description: "Patients, RDV, compliance. Calendar + dossiers structurés.",
    icon: "/icons/services/google-calendar.svg",
  },
];

export default function OnboardingVerticalPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Industry | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/set-industry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ industry: selected }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success("Vertical configuré", `Ton cockpit est désormais en mode ${selected}.`);
      router.push("/");
    } catch (err) {
      toast.error(
        "Impossible de définir le vertical",
        err instanceof Error ? err.message : "Erreur réseau",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 800,
        marginInline: "auto",
        padding: "var(--space-8) var(--space-6)",
      }}
    >
      <PageHeader title="Quelle est ton industrie ?" />

      <p
        className="t-13"
        style={{
          color: "var(--text-muted)",
          marginTop: "var(--space-3)",
          marginBottom: "var(--space-8)",
        }}
      >
        Cockpit, persona, vocabulaire et workflows s&apos;adaptent à ton secteur.
        Tu pourras changer ce choix plus tard depuis Admin → Tenant.
      </p>

      <div
        className="grid grid-cols-1 md:grid-cols-2"
        style={{ gap: "var(--space-3)" }}
      >
        {INDUSTRIES.map((ind) => {
          const isSelected = selected === ind.id;
          return (
            <button
              key={ind.id}
              type="button"
              onClick={() => setSelected(ind.id)}
              className="flex items-start text-left"
              style={{
                gap: "var(--space-3)",
                padding: "var(--space-4)",
                background: isSelected ? "var(--surface-2)" : "var(--surface-1)",
                border: `1px solid ${isSelected ? "var(--cykan)" : "var(--border-subtle)"}`,
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                transition: "all 150ms ease",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  flex: "0 0 32px",
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--surface-1)",
                  borderRadius: "var(--radius-xs)",
                }}
              >
                <img src={ind.icon} alt="" width={20} height={20} />
              </span>
              <div style={{ flex: "1 1 auto" }}>
                <div
                  className="t-13 font-medium"
                  style={{ color: isSelected ? "var(--cykan)" : "var(--text)" }}
                >
                  {ind.name}
                </div>
                <div className="t-11" style={{ color: "var(--text-muted)", marginTop: 2 }}>
                  {ind.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div
        className="flex justify-end"
        style={{ marginTop: "var(--space-8)", gap: "var(--space-3)" }}
      >
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!selected || submitting}
          className="read-more"
          style={{
            opacity: !selected || submitting ? 0.5 : 1,
            cursor: !selected || submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Configuration…" : "Continuer →"}
        </button>
      </div>
    </div>
  );
}
