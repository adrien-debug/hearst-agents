/**
 * OpenAI Assistants Tool Registry
 *
 * Définition des outils disponibles pour les assistants OpenAI.
 * Système extensible pour ajouter des outils personnalisés.
 */

import type OpenAI from "openai";

// ── Tool Definition ─────────────────────────────────────────

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/**
 * Execution context passed to handlers that need to act on behalf of a user
 * (e.g. tools that hit a third-party API via Composio with a user-scoped
 * entityId). Optional so existing pure-compute tools (calculate, format_text)
 * stay parameter-free.
 */
export interface ToolExecutionContext {
  userId?: string;
  runId?: string;
  tenantId?: string;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  context?: ToolExecutionContext,
) => Promise<string>;

export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

// ── Tool Registry ───────────────────────────────────────────

const tools = new Map<string, RegisteredTool>();

/**
 * Enregistre un nouvel outil.
 */
export function registerTool(name: string, definition: ToolDefinition, handler: ToolHandler): void {
  tools.set(name, { definition, handler });
}

/**
 * Récupère la définition d'un outil.
 */
export function getTool(name: string): RegisteredTool | undefined {
  return tools.get(name);
}

/**
 * Liste tous les outils disponibles.
 */
export function getAllTools(): RegisteredTool[] {
  return Array.from(tools.values());
}

/**
 * Convertit en format OpenAI Assistants.
 */
export function toOpenAITools(): OpenAI.Beta.AssistantTool[] {
  return Array.from(tools.values()).map(t => ({
    type: "function",
    function: {
      name: t.definition.function.name,
      description: t.definition.function.description,
      parameters: t.definition.function.parameters,
    },
  }));
}

/**
 * Convertit en format OpenAI Assistants, filtered by allowed tool names.
 * Used by the capability-first runtime to restrict tools per domain.
 */
export function toOpenAIToolsFiltered(allowedNames: string[]): OpenAI.Beta.AssistantTool[] {
  if (allowedNames.length === 0) return toOpenAITools();

  const allowed = new Set(allowedNames);
  return Array.from(tools.values())
    .filter(t => allowed.has(t.definition.function.name))
    .map(t => ({
      type: "function" as const,
      function: {
        name: t.definition.function.name,
        description: t.definition.function.description,
        parameters: t.definition.function.parameters,
      },
    }));
}

/**
 * Exécute un outil par nom.
 *
 * Resolution order:
 * 1. Static registry (curated tools registered via `registerTool()`).
 * 2. Composio dynamic dispatch — when the static lookup misses AND the
 *    request has a userId, the name is forwarded to Composio as an action
 *    slug. This is how all 1500+ Composio actions become callable without
 *    having to register each one statically.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<string> {
  const tool = tools.get(name);
  if (tool) {
    try {
      return await tool.handler(args, context);
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : "Tool execution failed",
      });
    }
  }

  if (context?.userId) {
    const { executeComposioAction, isComposioConfigured } = await import(
      "@/lib/connectors/composio"
    );
    if (isComposioConfigured()) {
      const result = await executeComposioAction({
        action: name,
        entityId: context.userId,
        params: args,
      });
      return JSON.stringify(
        result.ok
          ? { ok: true, data: result.data }
          : { ok: false, error: result.error, errorCode: result.errorCode },
      );
    }
  }

  throw new Error(`Tool not found: ${name}`);
}

// ── Built-in Tools ──────────────────────────────────────────

/**
 * Tool: get_current_time
 * Retourne l'heure et la date actuelles.
 */
registerTool(
  "get_current_time",
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Get the current date and time in ISO format and human-readable format",
      parameters: {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description: "Timezone (e.g., 'Europe/Paris', 'America/New_York'). Defaults to UTC if not specified.",
          },
        },
        required: [],
      },
    },
  },
  async (args) => {
    const timezone = args.timezone as string || "UTC";
    const now = new Date();
    return JSON.stringify({
      iso: now.toISOString(),
      formatted: now.toLocaleString("fr-FR", { timeZone: timezone }),
      timezone,
      timestamp: now.getTime(),
    });
  },
);

/**
 * Tool: calculate
 * Effectue des calculs mathématiques simples.
 */
registerTool(
  "calculate",
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Perform mathematical calculations. Supports basic operations: +, -, *, /, ** (power)",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "Mathematical expression to evaluate (e.g., '2 + 2', '10 * 5', '2 ** 8')",
          },
        },
        required: ["expression"],
      },
    },
  },
  async (args) => {
    const expression = args.expression as string;
    try {
      // Safe evaluation - only allow numbers and basic operators
      const sanitized = expression.replace(/[^0-9+\-*/.()\s\*\*]/g, "");
      // eslint-disable-next-line no-eval
      const result = eval(sanitized);
      return JSON.stringify({
        expression,
        result,
        type: typeof result,
      });
    } catch (error) {
      return JSON.stringify({
        error: `Invalid expression: ${expression}`,
        result: null,
      });
    }
  },
);

/**
 * Tool: format_text
 * Formate du texte (uppercase, lowercase, etc.)
 */
registerTool(
  "format_text",
  {
    type: "function",
    function: {
      name: "format_text",
      description: "Format text: uppercase, lowercase, capitalize, or reverse",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Text to format",
          },
          operation: {
            type: "string",
            enum: ["uppercase", "lowercase", "capitalize", "reverse", "trim"],
            description: "Formatting operation to apply",
          },
        },
        required: ["text", "operation"],
      },
    },
  },
  async (args) => {
    const text = args.text as string;
    const operation = args.operation as string;

    let result: string;
    switch (operation) {
      case "uppercase":
        result = text.toUpperCase();
        break;
      case "lowercase":
        result = text.toLowerCase();
        break;
      case "capitalize":
        result = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
        break;
      case "reverse":
        result = text.split("").reverse().join("");
        break;
      case "trim":
        result = text.trim();
        break;
      default:
        result = text;
    }

    return JSON.stringify({
      original: text,
      operation,
      result,
      length: result.length,
    });
  },
);

/**
 * Tool: web_search_simulation
 * Simule une recherche web (pour démo/tests).
 */
registerTool(
  "web_search_simulation",
  {
    type: "function",
    function: {
      name: "web_search_simulation",
      description: "Simulate a web search and return mock results. For testing purposes only.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          num_results: {
            type: "number",
            description: "Number of results to return (max 5)",
          },
        },
        required: ["query"],
      },
    },
  },
  async (args) => {
    const query = args.query as string;
    const numResults = Math.min(args.num_results as number || 3, 5);

    // Mock results
    const mockResults = [
      { title: `Result for: ${query}`, url: `https://example.com/search?q=${encodeURIComponent(query)}`, snippet: `This is a simulated search result for "${query}". In production, this would connect to a real search API.` },
      { title: `More about ${query}`, url: `https://example.com/more`, snippet: `Additional information about ${query} would appear here.` },
      { title: `${query} - Wikipedia`, url: `https://en.wikipedia.org/wiki/${query.replace(/\s+/g, "_")}`, snippet: `Wikipedia entry for ${query} (simulated).` },
      { title: `Latest news on ${query}`, url: `https://news.example.com/${query}`, snippet: `Recent news articles about ${query}.` },
      { title: `${query} documentation`, url: `https://docs.example.com/${query}`, snippet: `Technical documentation for ${query}.` },
    ].slice(0, numResults);

    return JSON.stringify({
      query,
      num_results: numResults,
      results: mockResults,
      simulated: true,
    });
  },
);

/**
 * Tool: gmail_send_email
 * Sends a real email via Gmail (using Composio under the hood).
 * Requires COMPOSIO_API_KEY + composio-core installed + the user's Gmail
 * account connected in Composio. The user identity comes from the
 * execution context, not from the LLM — the model can never spoof "from".
 */
registerTool(
  "gmail_send_email",
  {
    type: "function",
    function: {
      name: "gmail_send_email",
      description:
        "Send an email via the connected user's Gmail account. Use this when the user explicitly asks you to send / forward / reply to an email. Always confirm critical fields (recipient, subject) with the user before calling.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Recipient email address (a single address).",
          },
          subject: {
            type: "string",
            description: "Subject line. Required and must be non-empty.",
          },
          body: {
            type: "string",
            description: "Email body. Plain text by default; set is_html=true to send HTML.",
          },
          cc: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of CC addresses.",
          },
          bcc: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of BCC addresses.",
          },
          is_html: {
            type: "boolean",
            description: "If true, body is interpreted as HTML.",
          },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  async (args, context) => {
    const userId = context?.userId;
    if (!userId) {
      return JSON.stringify({
        ok: false,
        error: "gmail_send_email requires an authenticated user context.",
      });
    }

    const { gmailSendEmail } = await import("@/lib/connectors/composio");
    const result = await gmailSendEmail({
      userId,
      to: String(args.to ?? ""),
      subject: String(args.subject ?? ""),
      body: String(args.body ?? ""),
      cc: Array.isArray(args.cc) ? (args.cc as string[]) : undefined,
      bcc: Array.isArray(args.bcc) ? (args.bcc as string[]) : undefined,
      isHtml: Boolean(args.is_html),
    });

    return JSON.stringify(
      result.ok
        ? { ok: true, messageId: result.messageId, sentAt: Date.now() }
        : { ok: false, error: result.error, errorCode: result.errorCode },
    );
  },
);

// ── Tool Events ─────────────────────────────────────────────

export interface ToolCallEvent {
  type: "tool_call";
  tool_call_id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
  duration_ms?: number;
}

/**
 * Crée un assistant avec les outils intégrés.
 */
export async function createAssistantWithTools(
  model: string = "gpt-4o",
  name: string = "Hearst Assistant",
  instructions?: string,
): Promise<string> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const assistant = await client.beta.assistants.create({
    model,
    name,
    instructions: instructions || "You are a helpful assistant with access to tools. Use them when appropriate.",
    tools: toOpenAITools(),
  });

  return assistant.id;
}
