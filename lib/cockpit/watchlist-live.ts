/**
 * Watchlist live — calcule MRR / ARR / Pipeline / Runway depuis Stripe
 * + HubSpot via Composio.
 *
 * Sources :
 *  - MRR : `STRIPE_LIST_SUBSCRIPTIONS` (status=active) → sum prix normalisé
 *    sur intervalle mensuel.
 *  - ARR : MRR × 12.
 *  - Pipeline : `HUBSPOT_LIST_DEALS` (open) → sum amount × probability stage.
 *  - Runway : balance Stripe (charges nets sur 30j approx burn) → mois restants.
 *    Très approximatif sans ledger comptable, marqué `degraded: true`.
 *
 * Cache 5min par (userId, tenantId) — évite de bombarder Stripe à chaque
 * mount du cockpit.
 *
 * Si une source n'est pas connectée pour le user (Composio retourne
 * AUTH_REQUIRED), on retourne `value: "—"` + `cta: "Connecte X pour activer"`
 * au lieu de planter la home.
 */

import { executeComposioAction } from "@/lib/connectors/composio/client";
import type { CockpitWatchlistItem } from "./today";

interface CacheEntry {
  items: CockpitWatchlistItem[];
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(scope: { userId: string; tenantId: string }): string {
  return `${scope.tenantId}::${scope.userId}`;
}

function fmtEur(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M €`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k €`;
  return `${Math.round(n)} €`;
}

function ctaItem(id: string, label: string, missing: string): CockpitWatchlistItem {
  return {
    id,
    label,
    value: "—",
    delta: `Connecte ${missing} pour activer`,
    trend: [],
    source: "live",
  };
}

interface StripeSubscription {
  status?: string;
  items?: { data?: Array<{ price?: { unit_amount?: number; recurring?: { interval?: string; interval_count?: number } } }> };
  plan?: { amount?: number; interval?: string; interval_count?: number };
}

interface StripeCharge {
  amount?: number;
  currency?: string;
  refunded?: boolean;
  status?: string;
  created?: number;
}

interface HubspotDeal {
  amount?: number | string;
  probability?: number | string;
  hs_deal_stage_probability?: number | string;
  dealstage?: string;
  pipeline_stage_probability?: number;
  properties?: { amount?: string; hs_deal_stage_probability?: string; dealstage?: string };
}

/** Normalise une subscription Stripe en MRR (cents → euros). */
function subscriptionToMrr(sub: StripeSubscription): number {
  const items = sub.items?.data ?? [];
  let total = 0;
  for (const it of items) {
    const amount = it.price?.unit_amount ?? 0;
    const interval = it.price?.recurring?.interval ?? "month";
    const intervalCount = it.price?.recurring?.interval_count ?? 1;
    const monthly = normalizeMonthly(amount, interval, intervalCount);
    total += monthly;
  }
  if (total === 0 && sub.plan?.amount) {
    total = normalizeMonthly(
      sub.plan.amount,
      sub.plan.interval ?? "month",
      sub.plan.interval_count ?? 1,
    );
  }
  return total / 100;
}

function normalizeMonthly(
  amountCents: number,
  interval: string,
  intervalCount: number,
): number {
  const ic = intervalCount > 0 ? intervalCount : 1;
  switch (interval) {
    case "day":
      return (amountCents * 30) / ic;
    case "week":
      return (amountCents * 52) / 12 / ic;
    case "month":
      return amountCents / ic;
    case "year":
      return amountCents / 12 / ic;
    default:
      return amountCents / ic;
  }
}

function dealValue(deal: HubspotDeal): number {
  const props = deal.properties ?? {};
  const amountStr = props.amount ?? deal.amount ?? "0";
  const amount = typeof amountStr === "number" ? amountStr : Number(amountStr);
  if (!Number.isFinite(amount)) return 0;

  const probRaw =
    props.hs_deal_stage_probability ??
    deal.probability ??
    deal.hs_deal_stage_probability ??
    "1";
  let prob = typeof probRaw === "number" ? probRaw : Number(probRaw);
  if (!Number.isFinite(prob)) prob = 1;
  if (prob > 1) prob = prob / 100; // HubSpot renvoie parfois en pourcent

  return amount * Math.max(0, Math.min(prob, 1));
}

function unwrapData<T = unknown>(raw: unknown): T[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as T[];
  const obj = raw as { data?: unknown; items?: unknown; results?: unknown; response_data?: unknown };
  if (Array.isArray(obj.data)) return obj.data as T[];
  if (Array.isArray(obj.items)) return obj.items as T[];
  if (Array.isArray(obj.results)) return obj.results as T[];
  if (obj.response_data) return unwrapData<T>(obj.response_data);
  return [];
}

export async function getLiveWatchlist(scope: {
  userId: string;
  tenantId: string;
}): Promise<CockpitWatchlistItem[]> {
  const key = cacheKey(scope);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.items;
  }

  // Lance les 3 calls en parallèle, fail-soft chacun.
  const [subsRes, chargesRes, dealsRes] = await Promise.all([
    executeComposioAction({
      action: "STRIPE_LIST_SUBSCRIPTIONS",
      entityId: scope.userId,
      params: { status: "active", limit: 100 },
    }),
    executeComposioAction({
      action: "STRIPE_LIST_CHARGES",
      entityId: scope.userId,
      params: { limit: 100 },
    }),
    executeComposioAction({
      action: "HUBSPOT_LIST_DEALS",
      entityId: scope.userId,
      params: { limit: 200 },
    }),
  ]);

  const items: CockpitWatchlistItem[] = [];

  // ── MRR + ARR depuis Stripe subscriptions
  if (!subsRes.ok) {
    items.push(ctaItem("mrr", "MRR", "Stripe"));
    items.push(ctaItem("arr", "ARR", "Stripe"));
  } else {
    const subs = unwrapData<StripeSubscription>(subsRes.data).filter(
      (s) => s.status === "active" || s.status === "trialing",
    );
    const mrr = subs.reduce((acc, s) => acc + subscriptionToMrr(s), 0);
    const arr = mrr * 12;
    items.push({
      id: "mrr",
      label: "MRR",
      value: mrr > 0 ? fmtEur(mrr) : "—",
      delta: subs.length > 0 ? `${subs.length} abonnements actifs` : null,
      trend: [],
      source: "live",
    });
    items.push({
      id: "arr",
      label: "ARR",
      value: arr > 0 ? fmtEur(arr) : "—",
      delta: null,
      trend: [],
      source: "live",
    });
  }

  // ── Runway depuis charges nets (très approximatif)
  if (!chargesRes.ok) {
    items.push(ctaItem("runway", "Runway", "Stripe"));
  } else {
    const charges = unwrapData<StripeCharge>(chargesRes.data).filter(
      (c) => c.status === "succeeded" && !c.refunded,
    );
    // Approximation : si on a 30j de charges, sum = ~ revenu mensuel.
    // Sans accès au cash balance, on ne peut pas calculer un vrai runway →
    // on retourne "Voir Stripe" + delta informatif.
    const totalCents = charges.reduce((acc, c) => acc + (c.amount ?? 0), 0);
    items.push({
      id: "runway",
      label: "Runway",
      value: "—",
      delta:
        charges.length > 0
          ? `Revenu 30j ≈ ${fmtEur(totalCents / 100)}`
          : "Aucune charge récente",
      trend: [],
      source: "live",
    });
  }

  // ── Pipeline HubSpot
  if (!dealsRes.ok) {
    items.push(ctaItem("pipeline", "Pipeline", "HubSpot"));
  } else {
    const deals = unwrapData<HubspotDeal>(dealsRes.data);
    const openDeals = deals.filter((d) => {
      const stage = (d.properties?.dealstage ?? d.dealstage ?? "").toLowerCase();
      return !stage.includes("won") && !stage.includes("lost") && !stage.includes("closed");
    });
    const weighted = openDeals.reduce((acc, d) => acc + dealValue(d), 0);
    items.push({
      id: "pipeline",
      label: "Pipeline",
      value: weighted > 0 ? fmtEur(weighted) : "—",
      delta: openDeals.length > 0 ? `${openDeals.length} deals ouverts` : null,
      trend: [],
      source: "live",
    });
  }

  cache.set(key, { items, expiresAt: Date.now() + CACHE_TTL_MS });
  return items;
}

/** Test helper. */
export function _resetWatchlistCache(): void {
  cache.clear();
}
