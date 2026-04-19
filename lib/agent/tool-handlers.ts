/**
 * Tool handlers — execute real connector calls when the LLM invokes a tool.
 *
 * Each handler calls the existing unified layer / connectors
 * and returns a JSON string result for the LLM to interpret.
 */

import type { ToolName } from "./tools";
import { getMessages, getEvents, getFiles } from "./data-functions";
import { getTokens } from "@/lib/token-store";

export interface ToolExecResult {
  success: boolean;
  data: string;
  latency_ms: number;
}

type ToolHandler = (
  userId: string,
  input: Record<string, unknown>,
) => Promise<ToolExecResult>;

async function hasToken(userId: string, provider: string): Promise<boolean> {
  try {
    const tokens = await getTokens(userId, provider);
    return !!tokens.accessToken;
  } catch {
    return false;
  }
}

const handlers: Record<ToolName, ToolHandler> = {
  async get_emails(userId, input) {
    const start = Date.now();

    if (!(await hasToken(userId, "google"))) {
      return {
        success: false,
        data: JSON.stringify({ error: "Gmail non connecté. L'utilisateur doit le connecter dans Applications." }),
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
        data: JSON.stringify({ error: err instanceof Error ? err.message : "Erreur lecture emails" }),
        latency_ms: Date.now() - start,
      };
    }
  },

  async get_calendar_events(userId, input) {
    const start = Date.now();

    if (!(await hasToken(userId, "google"))) {
      return {
        success: false,
        data: JSON.stringify({ error: "Google Calendar non connecté." }),
        latency_ms: Date.now() - start,
      };
    }

    try {
      const _days = (input.days as number) ?? 7;
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

  async get_files(userId, input) {
    const start = Date.now();

    if (!(await hasToken(userId, "google"))) {
      return {
        success: false,
        data: JSON.stringify({ error: "Google Drive non connecté." }),
        latency_ms: Date.now() - start,
      };
    }

    try {
      const _limit = (input.limit as number) ?? 5;
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

  async get_slack_messages(userId, input) {
    const start = Date.now();

    if (!(await hasToken(userId, "slack"))) {
      return {
        success: false,
        data: JSON.stringify({ error: "Slack non connecté." }),
        latency_ms: Date.now() - start,
      };
    }

    try {
      const result = await getMessages(userId);
      const limit = (input.limit as number) ?? 10;
      const slackOnly = result.items.filter((m) => m.source === "Slack");
      return {
        success: true,
        data: JSON.stringify({
          total: slackOnly.length,
          messages: slackOnly.slice(0, limit),
        }),
        latency_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        data: JSON.stringify({ error: err instanceof Error ? err.message : "Erreur lecture Slack" }),
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
