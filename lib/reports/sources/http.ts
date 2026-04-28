/**
 * Adapter HTTP générique — fetch JSON puis extractTabular.
 *
 * Utilisé pour des sources publiques ou des APIs avec auth dans les headers
 * fournis par le ReportSpec. Pas d'appels vers des hôtes en localhost ou
 * en RFC1918 (anti-SSRF basique).
 */

import type { Tabular } from "@/lib/reports/engine/tabular";
import { extractTabular } from "./extract";

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 5_000_000; // 5 MB

export interface FetchHttpInput {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
}

export interface FetchHttpResult {
  rows: Tabular;
  ok: boolean;
  status?: number;
  error?: string;
}

export async function fetchHttp(input: FetchHttpInput): Promise<FetchHttpResult> {
  if (!isSafeUrl(input.url)) {
    return { rows: [], ok: false, error: `URL refusée (SSRF guard): ${input.url}` };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(input.url, {
      method: input.method ?? "GET",
      headers: input.headers,
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      return { rows: [], ok: false, status: res.status, error: `HTTP ${res.status}` };
    }

    // Limite de taille : on lit le body en buffer puis on parse seulement si <MAX_BYTES.
    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BYTES) {
      return {
        rows: [],
        ok: false,
        status: res.status,
        error: `réponse trop grosse (${contentLength} bytes > ${MAX_BYTES})`,
      };
    }

    const text = await res.text();
    if (text.length > MAX_BYTES) {
      return { rows: [], ok: false, status: res.status, error: "réponse > 5MB" };
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { rows: [], ok: false, status: res.status, error: "réponse non-JSON" };
    }

    return { rows: extractTabular(json), ok: true, status: res.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { rows: [], ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * SSRF guard léger : bloque localhost, IPs privées et schémas non-HTTP(s).
 * Ne remplace pas une politique réseau côté infra mais évite les bavures.
 */
function isSafeUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false; // link-local AWS metadata
  return true;
}
