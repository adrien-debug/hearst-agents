/**
 * Exa provider — recherche sémantique (neural search).
 *
 * Exa utilise des embeddings pour trouver des résultats par sens, pas par
 * mots-clés. Idéal pour les requêtes ouvertes, de veille, ou de recherche
 * de contenu similaire. Contraste avec Tavily qui est optimisé factuel.
 *
 * API : https://docs.exa.ai/reference/search
 */

export interface ExaResult {
  url: string;
  title: string;
  snippet: string;
}

interface ExaApiResult {
  url?: string;
  title?: string;
  publishedDate?: string;
  text?: string;
}

interface ExaApiResponse {
  results?: ExaApiResult[];
}

export async function exaSearch(
  query: string,
  options?: {
    numResults?: number;
    useAutoprompt?: boolean;
    type?: "neural" | "keyword";
  },
): Promise<ExaResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    console.warn("[Exa] EXA_API_KEY not set — skipping search");
    return [];
  }

  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      numResults: options?.numResults ?? 5,
      useAutoprompt: options?.useAutoprompt ?? true,
      type: options?.type ?? "neural",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[Exa] Search failed ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as ExaApiResponse;

  return (data.results ?? []).map((r) => ({
    url: r.url ?? "",
    title: r.title ?? "",
    snippet: [r.publishedDate, r.text].filter(Boolean).join(" · ").slice(0, 500),
  }));
}
