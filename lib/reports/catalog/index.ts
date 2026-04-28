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
import type { ReportSpec } from "@/lib/reports/spec/schema";

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
      });
    }
  }
  return out;
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
