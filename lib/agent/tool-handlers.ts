/**
 * Tool handlers — capability-based execution.
 *
 * Each handler uses the unified layer which already resolves
 * connected providers and merges results. No provider-specific logic here.
 */

import type { ToolName } from "./tools";
import { getMessages, getEvents, getFiles } from "./data-functions";
import { hasCapability } from "@/lib/capabilities";
import { searchWeb } from "./web-search";

export interface ToolExecResult {
  success: boolean;
  data: string;
  latency_ms: number;
}

type ToolHandler = (
  userId: string,
  input: Record<string, unknown>,
) => Promise<ToolExecResult>;

const handlers: Record<ToolName, ToolHandler> = {
  async get_messages(userId, input) {
    const start = Date.now();

    if (!(await hasCapability("messaging", userId))) {
      return {
        success: false,
        data: JSON.stringify({
          error: "Aucune messagerie connectée. L'utilisateur doit connecter un service dans Applications.",
        }),
        latency_ms: Date.now() - start,
      };
    }

    try {
      const result = await getMessages(userId);
      const limit = (input.limit as number) ?? 10;
      return {
        success: true,
        data: JSON.stringify({
          stats: result.stats,
          total: result.total,
          messages: result.items.slice(0, limit),
        }),
        latency_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        data: JSON.stringify({ error: err instanceof Error ? err.message : "Erreur lecture messages" }),
        latency_ms: Date.now() - start,
      };
    }
  },

  async get_calendar_events(userId, _input) {
    const start = Date.now();

    if (!(await hasCapability("calendar", userId))) {
      return {
        success: false,
        data: JSON.stringify({ error: "Agenda non connecté. L'utilisateur doit le connecter dans Applications." }),
        latency_ms: Date.now() - start,
      };
    }

    try {
      const result = await getEvents(userId);
      return {
        success: true,
        data: JSON.stringify({ total: result.total, events: result.items }),
        latency_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        data: JSON.stringify({ error: err instanceof Error ? err.message : "Erreur lecture agenda" }),
        latency_ms: Date.now() - start,
      };
    }
  },

  async get_files(userId, _input) {
    const start = Date.now();

    if (!(await hasCapability("files", userId))) {
      return {
        success: false,
        data: JSON.stringify({ error: "Fichiers non connectés. L'utilisateur doit connecter un service dans Applications." }),
        latency_ms: Date.now() - start,
      };
    }

    try {
      const result = await getFiles(userId);
      return {
        success: true,
        data: JSON.stringify({ total: result.total, files: result.items }),
        latency_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        data: JSON.stringify({ error: err instanceof Error ? err.message : "Erreur lecture fichiers" }),
        latency_ms: Date.now() - start,
      };
    }
  },

  async search_web(_userId, input) {
    const start = Date.now();
    const query = (input.query as string) ?? "";

    if (!query.trim()) {
      return {
        success: false,
        data: JSON.stringify({ error: "Query is required for web search" }),
        latency_ms: Date.now() - start,
      };
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        success: false,
        data: JSON.stringify({ error: "Web search provider unavailable — ANTHROPIC_API_KEY not configured" }),
        latency_ms: Date.now() - start,
      };
    }

    try {
      const result = await searchWeb(query);
      return {
        success: true,
        data: JSON.stringify(result),
        latency_ms: Date.now() - start,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Web search failed";
      console.error("[Tools] search_web error:", msg);
      return {
        success: false,
        data: JSON.stringify({ error: msg }),
        latency_ms: Date.now() - start,
      };
    }
  },
};

export async function executeToolCall(
  toolName: string,
  userId: string,
  input: Record<string, unknown>,
): Promise<ToolExecResult> {
  const handler = handlers[toolName as ToolName];
  if (!handler) {
    return {
      success: false,
      data: JSON.stringify({ error: `Tool inconnue: ${toolName}` }),
      latency_ms: 0,
    };
  }

  console.log(`[Tools] Executing ${toolName} for user=${userId}`);
  const result = await handler(userId, input);
  console.log(`[Tools] ${toolName} done — success=${result.success} latency=${result.latency_ms}ms`);
  return result;
}
