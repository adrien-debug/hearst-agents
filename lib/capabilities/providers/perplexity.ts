/**
 * Perplexity provider — recherche approfondie avec synthèse et citations.
 *
 * Perplexity combine un LLM et un moteur de recherche temps-réel. Idéal pour
 * les requêtes de recherche complexes qui nécessitent une synthèse structurée
 * avec sources vérifiées. Contraste avec Exa (sémantique) et Tavily (factuel
 * rapide) — Perplexity est le choix pour les analyses multi-sources.
 *
 * API : compatible OpenAI chat completions
 * Modèles : sonar (rapide) / sonar-pro (qualité) / sonar-reasoning (raisonnement)
 */

export interface PerplexityResult {
  answer: string;
  citations: string[];
  model: string;
}

interface PerplexityChoice {
  message?: { content?: string };
  finish_reason?: string;
}

interface PerplexityApiResponse {
  choices?: PerplexityChoice[];
  citations?: string[];
  model?: string;
}

export async function perplexitySearch(
  query: string,
  options?: {
    model?: "sonar" | "sonar-pro" | "sonar-reasoning";
    maxTokens?: number;
  },
): Promise<PerplexityResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.warn("[Perplexity] PERPLEXITY_API_KEY not set — skipping search");
    return { answer: "", citations: [], model: "" };
  }

  const model = options?.model ?? "sonar-pro";

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "Réponds de façon concise et structurée. Cite tes sources. Langue : celle de la question.",
        },
        { role: "user", content: query },
      ],
      max_tokens: options?.maxTokens ?? 1024,
      return_citations: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[Perplexity] Search failed ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as PerplexityApiResponse;

  return {
    answer: data.choices?.[0]?.message?.content ?? "",
    citations: data.citations ?? [],
    model: data.model ?? model,
  };
}
