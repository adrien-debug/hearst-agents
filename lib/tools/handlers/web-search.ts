/**
 * Web Search — routing par intent vers 3 providers.
 *
 * Routing :
 *   recherche  (explain / analyze / compare / why / how / overview / research…)
 *              → Perplexity  (sonar-pro, synthèse + citations)
 *   factuel    (who / when / what / define / meaning / price / weather / news)
 *              → Tavily  (searchDepth: basic, includeAnswer: true)
 *   sémantique (tout le reste)
 *              → Exa  (type: neural, useAutoprompt: true)
 *
 * Fallback : primary → secondary → tertiary.
 * Si les trois échouent → { error: "search_unavailable" }, pas de throw.
 *
 * Cache Redis 24h : `search:<sha256-16chars>` via lib/platform/redis/client.
 * Sans Redis (REDIS_URL absent), le cache est simplement ignoré.
 */

import { createHash } from "node:crypto";
import { getRedis } from "@/lib/platform/redis/client";
import { exaSearch } from "@/lib/capabilities/providers/exa";
import { tavilySearch } from "@/lib/capabilities/providers/tavily";
import { perplexitySearch } from "@/lib/capabilities/providers/perplexity";

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
const RESEARCH_KEYWORDS = [
  "explain", "analyze", "analyse", "compare", "why", "how does", "how do",
  "difference between", "pros", "cons", "overview", "research", "summarize",
  "summarise", "what is the best", "recommend", "guide", "tutorial",
];

function isResearchQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  // Long queries (>6 words) avec un mot-clé recherche
  const wordCount = q.split(/\s+/).length;
  return wordCount > 6 && RESEARCH_KEYWORDS.some((kw) => q.includes(kw));
}

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

async function runPerplexity(query: string): Promise<{ results: WebSearchResult["results"]; answer: string }> {
  const { answer, citations } = await perplexitySearch(query, { model: "sonar-pro" });
  // Perplexity retourne une synthèse + liste de citations URLs
  const results: WebSearchResult["results"] = citations.slice(0, 5).map((url, i) => ({
    title: `Source ${i + 1}`,
    url,
    snippet: i === 0 ? answer.slice(0, 500) : "",
  }));
  return { results, answer };
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

  const research = isResearchQuery(query);
  const factual = !research && isFactualQuery(query);

  // Ordre de priorité : research → Perplexity, factual → Tavily, reste → Exa
  const providers: Array<() => Promise<{ results: WebSearchResult["results"]; answer?: string }>> =
    research
      ? [() => runPerplexity(query), () => runTavily(query), () => runExa(query).then((r) => ({ results: r }))]
      : factual
        ? [() => runTavily(query), () => runExa(query).then((r) => ({ results: r })), () => runPerplexity(query)]
        : [() => runExa(query).then((r) => ({ results: r })), () => runTavily(query), () => runPerplexity(query)];

  for (const run of providers) {
    try {
      const { results, answer } = await run();
      if (results.length > 0 || answer) {
        rawResults = results;
        summary = answer ?? rawResults.map((r) => `- ${r.title}: ${r.snippet}`).join("\n");
        break;
      }
    } catch {
      // Essaie le provider suivant
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
