/**
 * Catalogue des reports prédéfinis.
 *
 * Chaque entrée = un builder paramétré qui produit un ReportSpec valide
 * étant donné le scope (et inputs spécifiques pour les Customer 360 etc.).
 *
 * Le matcher d'apps (`requiredApps`) sert à la discovery post-connexion :
 * un user qui connecte Stripe voit immédiatement Founder Cockpit et
 * Deal-to-Cash apparaître dans applicableReports[].
 */

import {
  buildFounderCockpit,
  FOUNDER_COCKPIT_ID,
  FOUNDER_COCKPIT_REQUIRED_APPS,
} from "./founder-cockpit";
import {
  buildCustomer360,
  CUSTOMER_360_ID,
  CUSTOMER_360_REQUIRED_APPS,
} from "./customer-360";
import {
  buildDealToCash,
  DEAL_TO_CASH_ID,
  DEAL_TO_CASH_REQUIRED_APPS,
} from "./deal-to-cash";
import {
  buildFinancialPnL,
  FINANCIAL_PNL_ID,
  FINANCIAL_PNL_REQUIRED_APPS,
} from "./financial-pnl";
import {
  buildProductAnalytics,
  PRODUCT_ANALYTICS_ID,
  PRODUCT_ANALYTICS_REQUIRED_APPS,
} from "./product-analytics";
import {
  buildSupportHealth,
  SUPPORT_HEALTH_ID,
  SUPPORT_HEALTH_REQUIRED_APPS,
} from "./support-health";
import {
  buildEngineeringVelocity,
  ENGINEERING_VELOCITY_ID,
  ENGINEERING_VELOCITY_REQUIRED_APPS,
} from "./engineering-velocity";
import {
  buildMarketingAarrr,
  MARKETING_AARRR_ID,
  MARKETING_AARRR_REQUIRED_APPS,
} from "./marketing-aarrr";
import {
  buildHrPeople,
  HR_PEOPLE_ID,
  HR_PEOPLE_REQUIRED_APPS,
} from "./hr-people";
import type { ReportSpec } from "@/lib/reports/spec/schema";
import type { TemplateSummary } from "@/lib/reports/templates/schema";

export interface CatalogEntry {
  id: string;
  title: string;
  description: string;
  domain: ReportSpec["meta"]["domain"];
  persona: ReportSpec["meta"]["persona"];
  /** Apps Composio + native nécessaires pour que ce report soit utile. */
  requiredApps: ReadonlyArray<string>;
  /**
   * Builder paramétré. `extra` est typé `unknown` ici — chaque builder
   * sait extraire ses inputs (ex: customerEmail pour Customer 360).
   */
  build: (scope: ReportSpec["scope"], extra?: Record<string, unknown>) => ReportSpec;
}

export const CATALOG: ReadonlyArray<CatalogEntry> = [
  {
    id: FOUNDER_COCKPIT_ID,
    title: "Founder Cockpit",
    description:
      "Vue d'ensemble quotidienne : MRR, pipeline, emails en attente, semaine, vélocité dev.",
    domain: "founder",
    persona: "founder",
    requiredApps: FOUNDER_COCKPIT_REQUIRED_APPS,
    build: (scope) => buildFounderCockpit(scope),
  },
  {
    id: CUSTOMER_360_ID,
    title: "Customer 360",
    description:
      "Vue unifiée d'un client : LTV, support, échanges, paiements à partir de l'email.",
    domain: "crm",
    persona: "csm",
    requiredApps: CUSTOMER_360_REQUIRED_APPS,
    build: (scope, extra) =>
      buildCustomer360(scope, String(extra?.customerEmail ?? "client@example.com")),
  },
  {
    id: DEAL_TO_CASH_ID,
    title: "Deal-to-Cash",
    description:
      "Funnel deal-to-cash : étapes pipeline, cycle time, deals bloqués sans facture.",
    domain: "finance",
    persona: "ops",
    requiredApps: DEAL_TO_CASH_REQUIRED_APPS,
    build: (scope) => buildDealToCash(scope),
  },
  {
    id: FINANCIAL_PNL_ID,
    title: "Financial P&L",
    description:
      "P&L mensuel, cash flow, runway et top expenses sur 12 mois.",
    domain: "finance",
    persona: "founder",
    requiredApps: FINANCIAL_PNL_REQUIRED_APPS,
    build: (scope) => buildFinancialPnL(scope),
  },
  {
    id: PRODUCT_ANALYTICS_ID,
    title: "Product Analytics",
    description:
      "Funnel AARRR, cohortes de rétention, NPS et features les plus utilisées.",
    domain: "growth",
    persona: "founder",
    requiredApps: PRODUCT_ANALYTICS_REQUIRED_APPS,
    build: (scope) => buildProductAnalytics(scope),
  },
  {
    id: SUPPORT_HEALTH_ID,
    title: "Support Health",
    description:
      "CSAT, SLA, volume tickets et top issues sur les 7 derniers jours.",
    domain: "support",
    persona: "csm",
    requiredApps: SUPPORT_HEALTH_REQUIRED_APPS,
    build: (scope) => buildSupportHealth(scope),
  },
  {
    id: ENGINEERING_VELOCITY_ID,
    title: "Engineering Velocity",
    description:
      "DORA metrics (Deploy Freq, Lead Time, CFR, MTTR), cycle time et top long-running PRs.",
    domain: "ops-eng",
    persona: "engineering",
    requiredApps: ENGINEERING_VELOCITY_REQUIRED_APPS,
    build: (scope) => buildEngineeringVelocity(scope),
  },
  {
    id: MARKETING_AARRR_ID,
    title: "Marketing AARRR",
    description:
      "Funnel AARRR, CAC / LTV / payback par cohorte et canal sur 12 semaines.",
    domain: "growth",
    persona: "marketing",
    requiredApps: MARKETING_AARRR_REQUIRED_APPS,
    build: (scope) => buildMarketingAarrr(scope),
  },
  {
    id: HR_PEOPLE_ID,
    title: "HR / People",
    description:
      "Hiring funnel, signaux burnout (heures tardives) et headcount plan sur 90 jours.",
    domain: "people",
    persona: "people",
    requiredApps: HR_PEOPLE_REQUIRED_APPS,
    build: (scope) => buildHrPeople(scope),
  },
];

export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find((c) => c.id === id);
}

/**
 * Retourne les reports applicables au user (intersect des apps connectées).
 *   - status="ready"   : toutes les requiredApps sont connectées
 *   - status="partial" : au moins une mais pas toutes
 *   - status="blocked" : aucune connectée → on ne propose pas
 */
export interface ApplicableReport {
  id: string;
  title: string;
  description: string;
  domain: ReportSpec["meta"]["domain"];
  persona: ReportSpec["meta"]["persona"];
  requiredApps: ReadonlyArray<string>;
  missingApps: ReadonlyArray<string>;
  status: "ready" | "partial" | "blocked";
  /** "catalog" = rapport prédéfini, "custom" = template sauvegardé par l'utilisateur */
  source: "catalog" | "custom";
}

export function getApplicableReports(
  connectedApps: ReadonlyArray<string>,
): ApplicableReport[] {
  const connected = new Set(connectedApps.map((a) => a.toLowerCase()));
  const out: ApplicableReport[] = [];
  for (const entry of CATALOG) {
    const missing = entry.requiredApps.filter((a) => !connected.has(a.toLowerCase()));
    const hits = entry.requiredApps.length - missing.length;
    let status: ApplicableReport["status"];
    if (hits === entry.requiredApps.length) status = "ready";
    else if (hits > 0) status = "partial";
    else status = "blocked";

    if (status !== "blocked") {
      out.push({
        id: entry.id,
        title: entry.title,
        description: entry.description,
        domain: entry.domain,
        persona: entry.persona,
        requiredApps: entry.requiredApps,
        missingApps: missing,
        status,
        source: "catalog",
      });
    }
  }
  return out;
}

/**
 * Merge les rapports prédéfinis du catalogue avec les templates personnalisés
 * du tenant. Les templates custom apparaissent toujours avec status="ready"
 * (l'utilisateur a déjà configuré le spec — pas de requiredApps).
 *
 * `customTemplates` est fourni par l'appelant (API route ayant déjà chargé
 * les templates depuis Supabase) pour éviter une dépendance circulaire avec
 * lib/reports/templates/store.ts dans ce module côté client.
 */
export function getApplicableReportsWithTemplates(
  connectedApps: ReadonlyArray<string>,
  customTemplates: ReadonlyArray<TemplateSummary>,
): ApplicableReport[] {
  const base = getApplicableReports(connectedApps);

  const custom: ApplicableReport[] = customTemplates.map((t) => ({
    id: t.id,
    title: t.name,
    description: t.description ?? "",
    // Le domaine des templates est text libre — caster vers le type attendu
    // avec fallback "mixed" si la valeur n'est pas dans l'enum.
    domain: (t.domain as ReportSpec["meta"]["domain"]) ?? "mixed",
    persona: "founder" as ReportSpec["meta"]["persona"],
    requiredApps: [],
    missingApps: [],
    status: "ready",
    source: "custom",
  }));

  return [...base, ...custom];
}

// Re-exports
export {
  buildFounderCockpit,
  FOUNDER_COCKPIT_ID,
  FOUNDER_COCKPIT_REQUIRED_APPS,
} from "./founder-cockpit";
export {
  buildCustomer360,
  CUSTOMER_360_ID,
  CUSTOMER_360_REQUIRED_APPS,
} from "./customer-360";
export {
  buildDealToCash,
  DEAL_TO_CASH_ID,
  DEAL_TO_CASH_REQUIRED_APPS,
} from "./deal-to-cash";
export {
  buildFinancialPnL,
  FINANCIAL_PNL_ID,
  FINANCIAL_PNL_REQUIRED_APPS,
} from "./financial-pnl";
export {
  buildProductAnalytics,
  PRODUCT_ANALYTICS_ID,
  PRODUCT_ANALYTICS_REQUIRED_APPS,
} from "./product-analytics";
export {
  buildSupportHealth,
  SUPPORT_HEALTH_ID,
  SUPPORT_HEALTH_REQUIRED_APPS,
} from "./support-health";
export {
  buildEngineeringVelocity,
  ENGINEERING_VELOCITY_ID,
  ENGINEERING_VELOCITY_REQUIRED_APPS,
} from "./engineering-velocity";
export {
  buildMarketingAarrr,
  MARKETING_AARRR_ID,
  MARKETING_AARRR_REQUIRED_APPS,
} from "./marketing-aarrr";
export {
  buildHrPeople,
  HR_PEOPLE_ID,
  HR_PEOPLE_REQUIRED_APPS,
} from "./hr-people";
