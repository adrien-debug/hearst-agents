/**
 * Browser Agent Loop (vague 9, action #4) — exécution multi-step LLM-driven.
 *
 * Avant cette refonte, le `stagehand-executor` faisait uniquement
 * `goto + observe + extract`. Pas de plan multi-step, pas de click ni de
 * fill, pas de raisonnement par tour. Cette boucle change ça :
 *
 *   1. On pose à Claude Sonnet une description de tâche + le contexte page
 *      courant (URL, title, snippet HTML cleané).
 *   2. Claude choisit un outil parmi { navigate, click, fill, wait, extract,
 *      done } via le mécanisme `tool_use` natif de l'API Anthropic.
 *   3. On exécute le tool via `PlaywrightPage`, on streame un event sur le
 *      bus pour le live action log, on append le tool_result à la
 *      conversation.
 *   4. Loop jusqu'à `done` ou cap maxSteps (default 15).
 *
 * Pourquoi ce pattern (vs frameworks tiers comme Stagehand SDK) :
 *  - zéro nouvelle dépendance (on a déjà `@anthropic-ai/sdk`)
 *  - contrôle total sur les events streamés (compat ActionLog UI)
 *  - prompt cache éphémère 5 min sur le system prompt → coûts maîtrisés
 *
 * Fail-soft : chaque tool exécution est try/catch, l'erreur est rebouclée
 * comme `tool_result` à Claude qui peut décider de retry ou abandonner.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ToolResultBlockParam,
  ToolUseBlock,
  Tool as AnthropicTool,
} from "@anthropic-ai/sdk/resources/messages";
import type { PlaywrightPage } from "./playwright-bridge";

// ── Tool definitions (Anthropic schema) ──────────────────────

const TOOLS: AnthropicTool[] = [
  {
    name: "navigate",
    description:
      "Navigate the browser to a URL. Use ONLY for absolute URLs (https://...). Returns the new page state.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string" as const,
          description: "Full URL to navigate to (must start with http:// or https://).",
        },
        reason: {
          type: "string" as const,
          description: "Why this navigation is needed, in one short sentence.",
        },
      },
      required: ["url", "reason"],
    },
  },
  {
    name: "click",
    description:
      "Click on a page element. Selector can be CSS (`button.cta`, `#submit`) or text-based (`text=Sign in`).",
    input_schema: {
      type: "object" as const,
      properties: {
        selector: {
          type: "string" as const,
          description:
            "CSS selector or `text=...` selector. Prefer stable attributes (`data-testid`, `aria-label`) over fragile classes.",
        },
        reason: {
          type: "string" as const,
          description: "Why this click is needed, in one short sentence.",
        },
      },
      required: ["selector", "reason"],
    },
  },
  {
    name: "fill",
    description: "Fill a form input with a value. Selector targets the input element.",
    input_schema: {
      type: "object" as const,
      properties: {
        selector: {
          type: "string" as const,
          description: "CSS selector of the input/textarea/contenteditable to fill.",
        },
        value: {
          type: "string" as const,
          description: "Text value to type into the input.",
        },
        reason: {
          type: "string" as const,
          description: "Why this fill is needed.",
        },
      },
      required: ["selector", "value", "reason"],
    },
  },
  {
    name: "wait",
    description:
      "Pause the loop for N milliseconds — use after a click that triggers an async load. Cap 5000ms.",
    input_schema: {
      type: "object" as const,
      properties: {
        ms: {
          type: "number" as const,
          description: "Milliseconds to wait (max 5000).",
        },
        reason: {
          type: "string" as const,
          description: "Why we need to wait.",
        },
      },
      required: ["ms", "reason"],
    },
  },
  {
    name: "extract",
    description:
      "Extract structured data from the current page. Use this near the end of a task when you have the data you need.",
    input_schema: {
      type: "object" as const,
      properties: {
        instruction: {
          type: "string" as const,
          description:
            "What to extract, in natural language (e.g. 'product price and availability').",
        },
        schema: {
          type: "object" as const,
          description: "Optional JSON Schema describing the target shape.",
        },
      },
      required: ["instruction"],
    },
  },
  {
    name: "done",
    description: "Terminate the loop. Call this when the task is complete or impossible.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: {
          type: "string" as const,
          description: "One-sentence summary of what was accomplished (or why it failed).",
        },
        success: {
          type: "boolean" as const,
          description: "true if task completed successfully, false otherwise.",
        },
      },
      required: ["summary", "success"],
    },
  },
];

const SYSTEM_PROMPT = [
  "Tu es un agent navigateur qui automatise des tâches web pour le compte d'un utilisateur.",
  "",
  "Tu disposes de 6 outils : navigate, click, fill, wait, extract, done.",
  "",
  "RÈGLES :",
  "- Une action par tour, jamais de plan en plusieurs étapes anticipé.",
  "- Quand tu cliques sur un bouton qui charge, ENCHAÎNE avec un wait(800-2000ms).",
  "- Privilégie les sélecteurs stables : `[data-testid=...]`, `[aria-label=...]`, `text=...`.",
  "- Si une action échoue, lis le résultat et adapte (essaie un autre selector, attends plus).",
  "- Quand la tâche est faite, appelle `done` avec un summary court.",
  "- Cap dur : 15 actions max. Si tu ne progresses pas après 5 actions, appelle `done` avec success=false.",
  "- N'invente JAMAIS un selector que tu n'as pas vu dans la page.",
  "",
  "À chaque tour, tu reçois l'URL + title + un extrait de page. Utilise-les pour décider.",
].join("\n");

// ── Types publics ────────────────────────────────────────────

export type AgentToolName =
  | "navigate"
  | "click"
  | "fill"
  | "wait"
  | "extract"
  | "done";

export interface AgentStep {
  tool: AgentToolName;
  input: Record<string, unknown>;
  /** Résultat structuré ou message d'erreur. */
  result: { ok: boolean; data?: unknown; error?: string };
  /** Durée d'exécution du tool (ms). */
  durationMs: number;
}

export interface AgentLoopOptions {
  task: string;
  page: PlaywrightPage;
  /** Cap sur le nombre d'actions (défaut 15, max 30). */
  maxSteps?: number;
  /** Override modèle (défaut Sonnet 4.6 — le plus précis pour tool_use). */
  model?: string;
  /** Signal d'abort externe (ex: Take Over). */
  abortSignal?: AbortSignal;
  /** Callback appelé après chaque step exécuté — sert à émettre les events
   *  côté stagehand-executor sans coupler ce module au runBus. */
  onStep?: (step: AgentStep) => void;
  /** Override pour les tests : substitue le client Anthropic. */
  anthropicClient?: Anthropic;
}

export interface AgentLoopResult {
  steps: AgentStep[];
  /** Summary final retourné via le tool `done`. */
  summary: string;
  /** True si l'agent a appelé `done({ success: true })`. */
  success: boolean;
  /** Données extraites lors du dernier `extract`, si applicable. */
  extractedData: unknown;
  /** True si le loop a été interrompu (max steps, abort, no-progress). */
  aborted: boolean;
}

// ── Helpers ──────────────────────────────────────────────────

function cleanHtmlSnippet(html: string, max = 4000): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function buildContextMessage(page: PlaywrightPage): Promise<string> {
  let url = "about:blank";
  let title = "";
  let snippet = "";
  try {
    url = page.url();
  } catch {
    /* ignore */
  }
  try {
    title = await page.title();
  } catch {
    /* ignore */
  }
  try {
    const html = await page.content();
    snippet = cleanHtmlSnippet(html);
  } catch {
    /* ignore */
  }
  return [
    "Page state:",
    `URL: ${url}`,
    `Title: ${title || "(empty)"}`,
    "",
    "Visible content (cleaned, truncated):",
    snippet || "(empty page)",
  ].join("\n");
}

function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted ?? false;
}

// ── Tool execution ───────────────────────────────────────────

interface ExecuteToolOpts {
  page: PlaywrightPage;
  toolName: string;
  input: Record<string, unknown>;
  anthropicClient: Anthropic;
}

interface ExecuteToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  /** Si true, le caller doit terminer la boucle. */
  terminal?: boolean;
}

async function executeTool(opts: ExecuteToolOpts): Promise<ExecuteToolResult> {
  const { page, toolName, input } = opts;

  try {
    switch (toolName) {
      case "navigate": {
        const url = String(input.url ?? "");
        if (!/^https?:\/\//i.test(url)) {
          return { ok: false, error: `invalid url: ${url}` };
        }
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
        return { ok: true, data: { url: page.url() } };
      }
      case "click": {
        const selector = String(input.selector ?? "");
        if (!selector) return { ok: false, error: "selector required" };
        await page.click(selector, { timeout: 10_000 });
        return { ok: true, data: { selector } };
      }
      case "fill": {
        const selector = String(input.selector ?? "");
        const value = String(input.value ?? "");
        if (!selector) return { ok: false, error: "selector required" };
        await page.fill(selector, value, { timeout: 10_000 });
        return { ok: true, data: { selector } };
      }
      case "wait": {
        const ms = Math.max(0, Math.min(Number(input.ms) || 500, 5000));
        if (page.waitForTimeout) {
          await page.waitForTimeout(ms);
        } else {
          await new Promise((r) => setTimeout(r, ms));
        }
        return { ok: true, data: { ms } };
      }
      case "extract": {
        const instruction = String(input.instruction ?? "");
        if (!instruction) return { ok: false, error: "instruction required" };
        const data = await extractStructured({
          page,
          instruction,
          schema: input.schema as Record<string, unknown> | undefined,
          anthropicClient: opts.anthropicClient,
        });
        return { ok: true, data };
      }
      case "done": {
        return {
          ok: true,
          data: {
            summary: String(input.summary ?? ""),
            success: Boolean(input.success),
          },
          terminal: true,
        };
      }
      default:
        return { ok: false, error: `unknown tool: ${toolName}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Structured extraction (réutilisé depuis stagehand-executor) ──

interface ExtractStructuredOpts {
  page: PlaywrightPage;
  instruction: string;
  schema?: Record<string, unknown>;
  anthropicClient: Anthropic;
}

async function extractStructured(opts: ExtractStructuredOpts): Promise<unknown> {
  const html = await opts.page.content().catch(() => "");
  const cleaned = cleanHtmlSnippet(html, 30_000);

  const system = [
    "Tu es un extracteur de données structurées depuis du HTML.",
    "Réponds UNIQUEMENT en JSON valide qui matche le schéma fourni.",
    "Pas de markdown fence, pas de texte autour.",
    "Si une donnée n'est pas trouvable, mets `null` plutôt que d'inventer.",
  ].join("\n");

  const user = [
    "Instruction :",
    opts.instruction,
    "",
    opts.schema
      ? `Schéma JSON cible :\n${JSON.stringify(opts.schema, null, 2)}`
      : "Schéma : pas de contrainte stricte, retourne un objet plat raisonnable.",
    "",
    "HTML nettoyé de la page :",
    cleaned,
  ].join("\n");

  const msg = await opts.anthropicClient.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system,
    messages: [{ role: "user", content: user }],
  });
  const textBlock = msg.content[0];
  const text = textBlock?.type === "text" ? textBlock.text.trim() : "";
  const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return { instruction: opts.instruction, raw: text };
  try {
    return JSON.parse(m[0]);
  } catch {
    return { instruction: opts.instruction, raw: text };
  }
}

// ── Boucle principale ────────────────────────────────────────

const NO_PROGRESS_LIMIT = 5;

export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const client =
    opts.anthropicClient ?? (apiKey ? new Anthropic({ apiKey }) : null);

  const result: AgentLoopResult = {
    steps: [],
    summary: "",
    success: false,
    extractedData: undefined,
    aborted: false,
  };

  if (!client) {
    result.aborted = true;
    result.summary = "ANTHROPIC_API_KEY absent — agent loop désactivé.";
    return result;
  }

  const maxSteps = Math.max(1, Math.min(opts.maxSteps ?? 15, 30));
  const model = opts.model ?? "claude-sonnet-4-6";

  // On démarre la conversation avec le contexte page initial.
  const context = await buildContextMessage(opts.page);
  const messages: MessageParam[] = [
    {
      role: "user",
      content: [
        { type: "text", text: `Tâche : ${opts.task}` },
        { type: "text", text: context },
        { type: "text", text: "Choisis ta première action." },
      ],
    },
  ];

  let consecutiveFailures = 0;

  for (let step = 0; step < maxSteps; step++) {
    if (isAborted(opts.abortSignal)) {
      result.aborted = true;
      result.summary = "Agent loop interrompu (abort signal).";
      break;
    }

    let response;
    try {
      response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });
    } catch (err) {
      result.aborted = true;
      result.summary = `Anthropic call failed: ${err instanceof Error ? err.message : String(err)}`;
      break;
    }

    // Cherche le bloc tool_use (Claude peut écrire un text + un tool_use)
    const toolUseBlock = response.content.find(
      (b): b is ToolUseBlock => b.type === "tool_use",
    );

    if (!toolUseBlock) {
      // Pas de tool_use — Claude a fini de répondre en texte. On termine.
      const textBlock = response.content.find((b) => b.type === "text");
      const text =
        textBlock && textBlock.type === "text" ? textBlock.text : "";
      result.summary = text.slice(0, 280) || "(no summary)";
      break;
    }

    const toolName = toolUseBlock.name;
    const toolInput = (toolUseBlock.input ?? {}) as Record<string, unknown>;

    const tStart = Date.now();
    const exec = await executeTool({
      page: opts.page,
      toolName,
      input: toolInput,
      anthropicClient: client,
    });
    const durationMs = Date.now() - tStart;

    const stepRecord: AgentStep = {
      tool: toolName as AgentToolName,
      input: toolInput,
      result: exec,
      durationMs,
    };
    result.steps.push(stepRecord);
    opts.onStep?.(stepRecord);

    if (toolName === "extract" && exec.ok) {
      result.extractedData = exec.data;
    }

    // Append assistant tool_use + user tool_result à la conversation
    messages.push({ role: "assistant", content: response.content });
    const toolResult: ToolResultBlockParam = {
      type: "tool_result",
      tool_use_id: toolUseBlock.id,
      content: JSON.stringify(exec).slice(0, 4000),
      is_error: !exec.ok,
    };

    if (exec.terminal) {
      // Tool `done` — on termine la boucle
      const finalData = exec.data as { summary?: string; success?: boolean };
      result.summary = finalData?.summary ?? "(no summary)";
      result.success = Boolean(finalData?.success);
      break;
    }

    // Track non-progrès : 5 échecs consécutifs → abort
    if (!exec.ok) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= NO_PROGRESS_LIMIT) {
        result.aborted = true;
        result.summary = `Aborted: ${NO_PROGRESS_LIMIT} actions consécutives en échec.`;
        break;
      }
    } else {
      consecutiveFailures = 0;
    }

    // Re-build context après l'action (sauf wait, pour économiser un fetch)
    const nextContext =
      toolName === "wait"
        ? `Result: ${JSON.stringify(exec).slice(0, 200)}`
        : await buildContextMessage(opts.page);

    messages.push({
      role: "user",
      content: [toolResult, { type: "text", text: nextContext }],
    });
  }

  if (!result.summary) {
    result.aborted = true;
    result.summary = `Agent loop a atteint le cap (${maxSteps} steps).`;
  }

  return result;
}
