/**
 * Web Search — routing par intent vers Exa (sémantique) ou Tavily (factuel).
 *
 * Phase 1.4 : deux providers premium remplacent l'ancien Anthropic built-in.
 *
 * Routing :
 *   factuel  (who / when / what / define / meaning / price / weather / news)
 *            → Tavily  (searchDepth: basic, includeAnswer: true)
 *   sémantique (tout le reste)
 *            → Exa  (type: neural, useAutoprompt: true)
 *
 * Si le provider primaire échoue ou que la clé manque, on tente le secondaire.
 * Si les deux échouent → { error: "search_unavailable" }, pas de throw.
 *
 * Cache Redis 24h : `search:<sha256-16chars>` via lib/platform/redis/client.
 * Sans Redis (REDIS_URL absent), le cache est simplement ignoré.
 */

import { createHash } from "node:crypto";
import { getRedis } from "@/lib/platform/redis/client";
import { exaSearch } from "@/lib/capabilities/providers/exa";
import { tavilySearch } from "@/lib/capabilities/providers/tavily";

export interface WebSearchResult {
  query: string;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  summary: string;
  error?: string;
}

const CACHE_TTL_SECONDS = 24 * 60 * 60;

const FACTUAL_KEYWORDS = ["who", "when", "what", "define", "meaning", "price", "weather", "news"];

function isFactualQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return FACTUAL_KEYWORDS.some(
    (kw) => q === kw || q.startsWith(kw + " ") || q.includes(" " + kw + " "),
  );
}

function hashQuery(query: string): string {
  return createHash("sha256").update(query.toLowerCase().trim()).digest("hex").slice(0, 16);
}

async function runExa(query: string): Promise<WebSearchResult["results"]> {
  const results = await exaSearch(query, { type: "neural", useAutoprompt: true, numResults: 5 });
  return results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet }));
}

async function runTavily(query: string): Promise<{ results: WebSearchResult["results"]; answer?: string }> {
  const results = await tavilySearch(query, { searchDepth: "basic", includeAnswer: true, maxResults: 5 });
  return {
    results: results.map((r) => ({ title: r.title, url: r.url, snippet: r.content })),
    answer: results[0]?.answer,
  };
}

export async function searchWeb(query: string): Promise<WebSearchResult> {
  const cacheKey = `search:${hashQuery(query)}`;

  // Cache check
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as WebSearchResult;
    } catch {
      // Non-fatal — continue to fetch
    }
  }

  let rawResults: WebSearchResult["results"] = [];
  let summary = "";

  const factual = isFactualQuery(query);

  try {
    if (factual) {
      const { results, answer } = await runTavily(query);
      rawResults = results;
      summary = answer ?? rawResults.map((r) => `- ${r.title}: ${r.snippet}`).join("\n");
    } else {
      rawResults = await runExa(query);
      summary = rawResults.map((r) => `- ${r.title}: ${r.snippet}`).join("\n");
    }
  } catch {
    // Primary provider failed — try secondary
    try {
      if (factual) {
        rawResults = await runExa(query);
        summary = rawResults.map((r) => `- ${r.title}: ${r.snippet}`).join("\n");
      } else {
        const { results, answer } = await runTavily(query);
        rawResults = results;
        summary = answer ?? rawResults.map((r) => `- ${r.title}: ${r.snippet}`).join("\n");
      }
    } catch {
      return {
        query,
        results: [],
        summary: "search_unavailable",
        error: "search_unavailable",
      };
    }
  }

  if (rawResults.length === 0) {
    return {
      query,
      results: [],
      summary: "search_unavailable",
      error: "search_unavailable",
    };
  }

  const result: WebSearchResult = { query, results: rawResults, summary };

  // Cache store
  if (redis) {
    try {
      await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));
    } catch {
      // Non-fatal
    }
  }

  return result;
}
