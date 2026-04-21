/**
 * Web Search — uses Anthropic's built-in web search server tool.
 *
 * Claude performs the search server-side and returns structured results.
 * No external API keys needed beyond the Anthropic API key.
 */

import Anthropic from "@anthropic-ai/sdk";

export interface WebSearchResult {
  query: string;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  summary: string;
}

export async function searchWeb(query: string): Promise<WebSearchResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const response = await client.beta.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      },
    ],
    messages: [
      {
        role: "user",
        content: `Recherche sur le web : "${query}". Fournis un résumé structuré des résultats les plus pertinents.`,
      },
    ],
  });

  const results: WebSearchResult["results"] = [];
  let summary = "";

  for (const block of response.content) {
    if (block.type === "web_search_tool_result" && "content" in block) {
      const content = block.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (
            typeof item === "object" &&
            item !== null &&
            "type" in item &&
            item.type === "web_search_result"
          ) {
            const r = item as { title?: string; url?: string; encrypted_content?: string; page_snippet?: string };
            results.push({
              title: r.title ?? "",
              url: r.url ?? "",
              snippet: r.page_snippet ?? "",
            });
          }
        }
      }
    }
    if (block.type === "text") {
      summary += block.text;
    }
  }

  if (!summary && results.length > 0) {
    summary = results.map((r) => `- ${r.title}: ${r.snippet}`).join("\n");
  }

  if (!summary && results.length === 0) {
    summary = `No results found for: ${query}`;
  }

  console.log(`[WebSearch] query="${query}" results=${results.length} summary_len=${summary.length}`);

  return { query, results, summary };
}
