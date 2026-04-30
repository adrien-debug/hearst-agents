/**
 * People Data Labs provider — enrichissement company (domain → firmographics).
 *
 * Wrap thin autour de `GET /v5/company/enrich`.
 * https://docs.peopledatalabs.com/docs/company-enrichment-api
 *
 * Sans `PDL_API_KEY` chaque fonction throw `PdlUnavailableError`.
 *
 * Cache LRU 24h (clé = domain lowercased) — quotas PDL identiques aux autres
 * data-providers, on évite les calls dupliqués.
 */

import QuickLRU from "@alloc/quick-lru";

const PDL_BASE = process.env.PDL_API_BASE ?? "https://api.peopledatalabs.com/v5";

export class PdlUnavailableError extends Error {
  constructor(message = "People Data Labs non configuré (PDL_API_KEY manquant)") {
    super(message);
    this.name = "PdlUnavailableError";
  }
}

export function isPdlConfigured(): boolean {
  return Boolean(process.env.PDL_API_KEY);
}

function getApiKey(): string {
  const key = process.env.PDL_API_KEY;
  if (!key) throw new PdlUnavailableError();
  return key;
}

export interface PdlCompany {
  name: string | null;
  domain: string;
  industry: string | null;
  size: string | null;
  founded: number | null;
  headcount: number | null;
  funding: number | null;
  fundingStage: string | null;
  hq: { city: string | null; country: string | null };
  linkedin: string | null;
  raw?: unknown;
}

const companyCache = new QuickLRU<string, PdlCompany>({
  maxSize: 512,
  maxAge: 24 * 60 * 60 * 1000,
});

/** Enrichit une entreprise via son domaine principal. */
export async function enrichCompany(input: { domain: string }): Promise<PdlCompany> {
  const domain = input.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!domain) throw new Error("[PDL] domain requis");

  const cached = companyCache.get(domain);
  if (cached) return cached;

  const apiKey = getApiKey();
  const url = new URL(`${PDL_BASE}/company/enrich`);
  url.searchParams.set("website", domain);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `[PDL] enrich status=${res.status} message=${body.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as {
    name?: string;
    industry?: string;
    size?: string;
    founded?: number;
    employee_count?: number;
    total_funding_raised?: number;
    last_funding_stage?: string;
    location?: { locality?: string; country?: string };
    linkedin_url?: string;
  };

  const result: PdlCompany = {
    name: data.name ?? null,
    domain,
    industry: data.industry ?? null,
    size: data.size ?? null,
    founded: typeof data.founded === "number" ? data.founded : null,
    headcount: typeof data.employee_count === "number" ? data.employee_count : null,
    funding: typeof data.total_funding_raised === "number" ? data.total_funding_raised : null,
    fundingStage: data.last_funding_stage ?? null,
    hq: {
      city: data.location?.locality ?? null,
      country: data.location?.country ?? null,
    },
    linkedin: data.linkedin_url ?? null,
    raw: data,
  };

  companyCache.set(domain, result);
  return result;
}

export function _resetPdlCache(): void {
  companyCache.clear();
}
