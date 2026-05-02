/**
 * Web search — exposé à la pipeline IA via wrapping de lib/tools/handlers/web-search.ts.
 *
 * Le handler existant route par intent vers Perplexity / Tavily / Exa avec fallback
 * et cache Redis 24h. Ce fichier l'expose comme tool natif au LLM (alongside
 * Google, Composio, hearst-actions, enrich…) pour combler le gap "fetch real-time
 * info" — actualités, prix, données publiques, recherche factuelle.
 */

import { jsonSchema } from "ai";
import type { Tool } from "ai";
import { searchWeb } from "@/lib/tools/handlers/web-search";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AiToolMap = Record<string, Tool<any, any>>;

interface WebSearchArgs {
  query: string;
}

function formatResult(query: string, summary: string, results: Array<{ title: string; url: string; snippet: string }>): string {
  const lines: string[] = [];
  lines.push(`Recherche : ${query}`);
  lines.push("");
  if (summary && summary !== "search_unavailable") {
    lines.push(summary.slice(0, 1500));
    lines.push("");
  }
  if (results.length > 0) {
    lines.push("Sources :");
    results.slice(0, 5).forEach((r, i) => {
      lines.push(`${i + 1}. ${r.title}`);
      lines.push(`   ${r.url}`);
      if (r.snippet) lines.push(`   ${r.snippet.slice(0, 200)}`);
    });
  }
  return lines.join("\n");
}

export function buildWebSearchTools(): AiToolMap {
  const webSearchTool: Tool<WebSearchArgs, string> = {
    description:
      "Recherche d'informations à jour sur le web (actualités, prix, données publiques, faits, définitions, météo). Routing automatique : Perplexity pour synthèse, Tavily pour factuel, Exa pour sémantique. Cache 24h. Use this dès que le user demande une info qui change dans le temps ou que tu n'as pas dans tes connaissances.",
    inputSchema: jsonSchema<WebSearchArgs>({
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "Requête de recherche en langage naturel (ex: 'prix du bitcoin aujourd'hui', 'dernières actualités sur l'IA générative', 'capitale du Pérou').",
        },
      },
    }),
    execute: async (args) => {
      try {
        const result = await searchWeb(args.query);
        if (result.error === "search_unavailable") {
          return "Recherche web indisponible (les 3 providers ont échoué). Réessaie plus tard ou reformule la requête.";
        }
        return formatResult(result.query, result.summary, result.results);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Échec de recherche : ${msg}`;
      }
    },
  };

  return {
    web_search: webSearchTool,
  };
}
