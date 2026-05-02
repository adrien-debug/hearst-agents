/**
 * Hospitality vertical — détection d'industrie tenant + helpers métier.
 *
 * `getTenantIndustry(tenantId)` lit le store `tenant_settings` (Supabase)
 * et fallback en mémoire. Default "general" — fail-soft : aucune erreur ne
 * doit casser un tenant non-hospitality.
 *
 * Vocabulaire & KPIs hospitality exposés ici pour réutilisation orchestrator,
 * persona system prompt addon, briefing enrichi.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type TenantIndustry =
  | "general"
  | "hospitality"
  | "saas"
  | "ecommerce"
  | "finance"
  | "healthcare";

export const HOSPITALITY_VOCABULARY = {
  preferred: [
    "guest",
    "room",
    "occupancy",
    "ADR",
    "RevPAR",
    "VIP",
    "check-in",
    "check-out",
    "OTA",
    "PMS",
    "concierge",
    "service request",
    "front desk",
  ],
  avoid: ["client", "user", "ticket", "deal", "lead", "MRR"],
} as const;

export const HOSPITALITY_KPIS = [
  "occupancy",
  "adr",
  "revpar",
  "vip_count",
  "service_requests_pending",
  "guest_satisfaction_nps",
] as const;

let _client: SupabaseClient | null = null;

function db(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}

const memoryStore: Map<string, TenantIndustry> = new Map();

const VALID_INDUSTRIES: ReadonlyArray<TenantIndustry> = [
  "general",
  "hospitality",
  "saas",
  "ecommerce",
  "finance",
  "healthcare",
];

function normalizeIndustry(raw: unknown): TenantIndustry {
  if (typeof raw !== "string") return "general";
  return (VALID_INDUSTRIES as ReadonlyArray<string>).includes(raw)
    ? (raw as TenantIndustry)
    : "general";
}

/**
 * Lit l'industry du tenant. Fallback "general" si aucune donnée ou erreur.
 * Cache 5min en mémoire pour éviter un round-trip Supabase à chaque request.
 */
const cacheTtlMs = 5 * 60_000;
const cache: Map<string, { industry: TenantIndustry; cachedAt: number }> = new Map();

export async function getTenantIndustry(tenantId: string): Promise<TenantIndustry> {
  if (!tenantId) return "general";

  const cached = cache.get(tenantId);
  if (cached && Date.now() - cached.cachedAt < cacheTtlMs) {
    return cached.industry;
  }

  const memVal = memoryStore.get(tenantId);
  if (memVal) {
    cache.set(tenantId, { industry: memVal, cachedAt: Date.now() });
    return memVal;
  }

  const sb = db();
  if (!sb) {
    cache.set(tenantId, { industry: "general", cachedAt: Date.now() });
    return "general";
  }

  try {
    const { data, error } = await sb
      .from("tenant_settings")
      .select("industry")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) {
      console.warn("[hospitality] getTenantIndustry supabase error:", error.message);
      cache.set(tenantId, { industry: "general", cachedAt: Date.now() });
      return "general";
    }
    const industry = normalizeIndustry(data?.industry);
    cache.set(tenantId, { industry, cachedAt: Date.now() });
    return industry;
  } catch (err) {
    console.warn("[hospitality] getTenantIndustry failed:", err);
    cache.set(tenantId, { industry: "general", cachedAt: Date.now() });
    return "general";
  }
}

/**
 * Définit l'industry d'un tenant. Persisté en Supabase si dispo, sinon en
 * mémoire (utile pour seed/dev). Invalide le cache.
 */
export async function setTenantIndustry(
  tenantId: string,
  industry: TenantIndustry,
): Promise<void> {
  if (!tenantId) throw new Error("tenantId requis");
  const normalized = normalizeIndustry(industry);
  memoryStore.set(tenantId, normalized);
  cache.delete(tenantId);

  const sb = db();
  if (!sb) return;

  try {
    await sb.from("tenant_settings").upsert(
      {
        tenant_id: tenantId,
        industry: normalized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
  } catch (err) {
    console.warn("[hospitality] setTenantIndustry persistence failed:", err);
  }
}

/** Helper raccourci utilisé par les routes/UI : true si industry === "hospitality". */
export async function isHospitalityTenant(tenantId: string): Promise<boolean> {
  return (await getTenantIndustry(tenantId)) === "hospitality";
}

/** Test-only : reset cache + memory store. */
export function __resetHospitalityCache(): void {
  cache.clear();
  memoryStore.clear();
}
