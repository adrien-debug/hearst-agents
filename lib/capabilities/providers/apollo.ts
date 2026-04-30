/**
 * Apollo.io provider — enrichissement contact (email → personne).
 *
 * Wrap thin autour de `POST /v1/people/match`.
 * https://docs.apollo.io/reference/people-enrichment
 *
 * Sans `APOLLO_API_KEY` chaque fonction throw `ApolloUnavailableError`.
 *
 * Cache LRU 24h (clé = email lowercased) — quotas Apollo serrés (5k req/mois
 * sur le plan basique), on évite tout call dupliqué sur même contact.
 */

import QuickLRU from "@alloc/quick-lru";

const APOLLO_BASE = process.env.APOLLO_API_BASE ?? "https://api.apollo.io/api/v1";

export class ApolloUnavailableError extends Error {
  constructor(message = "Apollo non configuré (APOLLO_API_KEY manquant)") {
    super(message);
    this.name = "ApolloUnavailableError";
  }
}

export function isApolloConfigured(): boolean {
  return Boolean(process.env.APOLLO_API_KEY);
}

function getApiKey(): string {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new ApolloUnavailableError();
  return key;
}

export interface ApolloPerson {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  company: string | null;
  companyDomain: string | null;
  linkedin: string | null;
  email: string | null;
  city: string | null;
  country: string | null;
  raw?: unknown;
}

const personCache = new QuickLRU<string, ApolloPerson>({
  maxSize: 512,
  maxAge: 24 * 60 * 60 * 1000,
});

/** Enrichit une personne via son email. */
export async function enrichPerson(input: { email: string }): Promise<ApolloPerson> {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("[Apollo] email requis");

  const cached = personCache.get(email);
  if (cached) return cached;

  const apiKey = getApiKey();

  const res = await fetch(`${APOLLO_BASE}/people/match`, {
    method: "POST",
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({ email, reveal_personal_emails: false }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `[Apollo] match status=${res.status} message=${body.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as {
    person?: {
      name?: string;
      first_name?: string;
      last_name?: string;
      title?: string;
      organization?: { name?: string; primary_domain?: string };
      linkedin_url?: string;
      email?: string;
      city?: string;
      country?: string;
    };
  };

  const p = data.person;
  const result: ApolloPerson = {
    name: p?.name ?? null,
    firstName: p?.first_name ?? null,
    lastName: p?.last_name ?? null,
    title: p?.title ?? null,
    company: p?.organization?.name ?? null,
    companyDomain: p?.organization?.primary_domain ?? null,
    linkedin: p?.linkedin_url ?? null,
    email: p?.email ?? email,
    city: p?.city ?? null,
    country: p?.country ?? null,
    raw: p,
  };

  personCache.set(email, result);
  return result;
}

export function _resetApolloCache(): void {
  personCache.clear();
}
