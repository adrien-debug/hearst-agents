/**
 * Tavily provider — recherche agentique (résultats frais, structurés).
 *
 * Tavily est conçu pour les agents IA : résultats toujours frais (pas de
 * contenu périmé), directement exploitables sans parsing HTML. Inclut une
 * `answer` synthétisée quand `includeAnswer: true`. Idéal pour les requêtes
 * factuelles (prix, météo, actualité, définitions).
 *
 * API : https://docs.tavily.com/docs/rest-api/api-reference
 */

export interface TavilyResult {
  url: string;
  title: string;
  content: string;
  /** Réponse directe synthétisée par Tavily. Présente uniquement sur le
   * premier résultat quand includeAnswer=true. */
  answer?: string;
}

interface TavilyApiResult {
  url?: string;
  title?: string;
  content?: string;
}

interface TavilyApiResponse {
  results?: TavilyApiResult[];
  answer?: string;
}

export async function tavilySearch(
  query: string,
  options?: {
    maxResults?: number;
    searchDepth?: "basic" | "advanced";
    includeAnswer?: boolean;
  },
): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn("[Tavily] TAVILY_API_KEY not set — skipping search");
    return [];
  }

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: options?.maxResults ?? 5,
      search_depth: options?.searchDepth ?? "basic",
      include_answer: options?.includeAnswer ?? true,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[Tavily] Search failed ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as TavilyApiResponse;
  const answer = data.answer;

  return (data.results ?? []).map((r, i) => ({
    url: r.url ?? "",
    title: r.title ?? "",
    content: r.content ?? "",
    ...(i === 0 && answer ? { answer } : {}),
  }));
}
