/**
 * OpenAI Computer Use API Backend
 *
 * Permet à l'IA de contrôler un ordinateur via screenshots et actions.
 * Parfait pour l'automatisation UI, le testing visuel, la navigation web.
 *
 * ⚠️ Nécessite le modèle "computer-use-preview" et des droits spéciaux sur le compte OpenAI.
 */

import OpenAI from "openai";
import type { ManagedAgentEvent } from "./types";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

// ── Types ───────────────────────────────────────────────────

export interface ComputerUseConfig {
  model?: string;
  displayWidth?: number;
  displayHeight?: number;
  environment?: "browser" | "mac" | "windows" | "ubuntu";
}

export interface Screenshot {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/png" | "image/jpeg";
    data: string;
  };
}

export interface ComputerAction {
  type: "click" | "scroll" | "type" | "keypress" | "screenshot" | "wait";
  // Click
  x?: number;
  y?: number;
  button?: "left" | "right" | "wheel" | "back" | "forward";
  // Scroll
  scrollX?: number;
  scrollY?: number;
  // Type
  text?: string;
  // Keypress
  keys?: string[];
  // Wait
  duration?: number;
}

export interface ComputerSession {
  id: string;
  screenshots: Screenshot[];
  actions: ComputerAction[];
  lastResponseId?: string;
}

// ── Core Functions ─────────────────────────────────────────

/**
 * Crée une session Computer Use.
 */
export function createComputerSession(): ComputerSession {
  return {
    id: `computer_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    screenshots: [],
    actions: [],
  };
}

/**
 * Encode une image en base64 pour l'envoyer à l'API.
 */
export function encodeImageToBase64(
  imageBuffer: Buffer,
  mediaType: "image/png" | "image/jpeg" = "image/png",
): Screenshot {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mediaType,
      data: imageBuffer.toString("base64"),
    },
  };
}

/**
 * Exécute une étape Computer Use.
 * Prend un screenshot + contexte, retourne l'action à effectuer.
 */
export async function executeComputerStep(
  session: ComputerSession,
  screenshot: Screenshot,
  instruction: string,
  config: ComputerUseConfig = {},
): Promise<{
  reasoning?: string;
  action?: ComputerAction;
  done?: boolean;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
}> {
  const model = config.model ?? "computer-use-preview";
  const displayWidth = config.displayWidth ?? 1280;
  const displayHeight = config.displayHeight ?? 800;
  const environment = config.environment ?? "browser";

  // Construire le message avec l'image
  const messageContent: OpenAI.Chat.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `Task: ${instruction}\n\nCurrent screenshot provided. Analyze and decide the next action.`,
    },
    {
      type: "image_url",
      image_url: {
        url: `data:${screenshot.source.media_type};base64,${screenshot.source.data}`,
        detail: "high",
      },
    },
  ];

  // Appeler l'API avec le tool computer-use
  const response = await getClient().chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: `You are controlling a computer. Available actions:
- click(x, y, button="left"): Click at coordinates
- scroll(x, y, scrollX, scrollY): Scroll at coordinates  
- type(text): Type text
- keypress(keys[]): Press keys (e.g., ["Ctrl", "C"])
- screenshot(): Take a screenshot
- wait(duration_ms): Wait

Display: ${displayWidth}x${displayHeight}
Environment: ${environment}

Respond with the action to take.`,
      },
      {
        role: "user",
        content: messageContent,
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "computer",
          description: "Control the computer",
          parameters: {
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: ["click", "scroll", "type", "keypress", "screenshot", "wait"],
              },
              x: { type: "number" },
              y: { type: "number" },
              button: {
                type: "string",
                enum: ["left", "right", "wheel", "back", "forward"],
              },
              scrollX: { type: "number" },
              scrollY: { type: "number" },
              text: { type: "string" },
              keys: { type: "array", items: { type: "string" } },
              duration: { type: "number" },
            },
            required: ["action"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "done",
          description: "Task completed successfully",
          parameters: {
            type: "object",
            properties: {
              reasoning: { type: "string" },
            },
            required: ["reasoning"],
          },
        },
      },
    ],
    tool_choice: "auto",
  });

  const choice = response.choices[0];
  const toolCalls = choice.message.tool_calls;

  // Calculer le coût
  const usage = response.usage;
  const costUsd = usage
    ? calculateComputerUseCost(usage.prompt_tokens, usage.completion_tokens)
    : 0;

  // Vérifier si c'est terminé (check function property exists)
  const doneCall = toolCalls?.find(
    tc => "function" in tc && tc.function?.name === "done"
  );
  if (doneCall && "function" in doneCall) {
    const args = JSON.parse(doneCall.function.arguments);
    return {
      done: true,
      reasoning: args.reasoning,
      usage: usage
        ? {
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens,
            costUsd,
          }
        : undefined,
    };
  }

  // Extraire l'action computer
  const computerCall = toolCalls?.find(
    tc => "function" in tc && tc.function?.name === "computer"
  );
  if (computerCall && "function" in computerCall) {
    const args = JSON.parse(computerCall.function.arguments);
    const action: ComputerAction = {
      type: args.action,
      x: args.x,
      y: args.y,
      button: args.button,
      scrollX: args.scrollX,
      scrollY: args.scrollY,
      text: args.text,
      keys: args.keys,
      duration: args.duration,
    };

    // Sauvegarder dans la session
    session.screenshots.push(screenshot);
    session.actions.push(action);

    return {
      action,
      reasoning: choice.message.content ?? "Executing action",
      usage: usage
        ? {
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens,
            costUsd,
          }
        : undefined,
    };
  }

  // Aucun tool call — la réponse est directe
  return {
    reasoning: choice.message.content ?? "No action needed",
    done: true,
    usage: usage
      ? {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          costUsd,
        }
      : undefined,
  };
}

/**
 * Exécute une tâche Computer Use complète avec streaming.
 * Le caller doit fournir une fonction getScreenshot() qui retourne le screenshot actuel.
 */
export async function* runComputerTask(
  instruction: string,
  getScreenshot: () => Promise<Buffer> | Buffer,
  config: ComputerUseConfig = {},
  maxSteps: number = 10,
): AsyncGenerator<ManagedAgentEvent> {
  const session = createComputerSession();
  let steps = 0;
  let totalCost = 0;

  yield {
    type: "step",
    timestamp: Date.now(),
    status: "running",
    content: `Starting computer task: ${instruction}`,
  };

  while (steps < maxSteps) {
    steps++;

    // Prendre un screenshot
    const imageBuffer = await getScreenshot();
    const screenshot = encodeImageToBase64(imageBuffer);

    yield {
      type: "step",
      timestamp: Date.now(),
      status: "running",
      content: `Step ${steps}: Analyzing screenshot...`,
    };

    // Exécuter l'étape
    const result = await executeComputerStep(session, screenshot, instruction, config);

    if (result.usage) {
      totalCost += result.usage.costUsd;
    }

    // Si terminé
    if (result.done) {
      yield {
        type: "step",
        timestamp: Date.now(),
        status: "done",
        content: result.reasoning ?? "Task completed",
        usage: {
          costUsd: totalCost,
        },
      };

      yield {
        type: "idle",
        timestamp: Date.now(),
        content: result.reasoning,
        usage: {
          costUsd: totalCost,
        },
      };

      return;
    }

    // Sinon, yield l'action à effectuer
    if (result.action) {
      yield {
        type: "tool_call",
        timestamp: Date.now(),
        tool: `computer:${result.action.type}`,
        status: "running",
        content: JSON.stringify(result.action),
      };

      // Attendre que l'appelant exécute l'action et prenne un nouveau screenshot
      yield {
        type: "step",
        timestamp: Date.now(),
        status: "running",
        content: `Waiting for action execution: ${result.action.type}`,
      };
    }
  }

  // Max steps atteint
  yield {
    type: "step",
    timestamp: Date.now(),
    status: "done",
    content: `Task stopped after ${maxSteps} steps`,
    usage: {
      costUsd: totalCost,
    },
  };

  yield {
    type: "idle",
    timestamp: Date.now(),
    content: `Max steps (${maxSteps}) reached`,
    usage: {
      costUsd: totalCost,
    },
  };
}

// ── Utilities ───────────────────────────────────────────────

function calculateComputerUseCost(tokensIn: number, tokensOut: number): number {
  // Computer Use Preview pricing (approximatif — vérifier documentation OpenAI)
  // Généralement plus cher que GPT-4o à cause du traitement d'images
  const inPrice = 3.0; // $3 per 1M input tokens
  const outPrice = 12.0; // $12 per 1M output tokens

  return (tokensIn * inPrice + tokensOut * outPrice) / 1_000_000;
}

// ── Mock/Testing Functions ───────────────────────────────────

/**
 * Crée un screenshot mock pour les tests.
 */
export function createMockScreenshot(
  width: number = 1280,
  height: number = 800,
): Buffer {
  // Créer une image PNG simple (1x1 pixel noir étendu)
  // En vrai, utiliser une lib comme sharp ou canvas
  // Pour les tests, on retourne un buffer minimal

  // PNG minimal 1x1 black
  const minimalPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );

  return minimalPng;
}

/**
 * Simule l'exécution d'une action (pour tests).
 */
export async function mockExecuteAction(action: ComputerAction): Promise<void> {
  // Simuler un délai
  await new Promise(r => setTimeout(r, 100));

  // Log l'action
  console.log("[Mock Action]", action);
}

/**
 * Test basique du backend Computer Use.
 * ⚠️ Nécessite des droits Computer Use sur le compte OpenAI.
 */
export async function testComputerUseBackend(): Promise<{
  ok: boolean;
  error?: string;
  hasAccess?: boolean;
}> {
  try {
    // Vérifier si on a accès au modèle
    const response = await getClient().chat.completions.create({
      model: "computer-use-preview",
      messages: [{ role: "user", content: "test" }],
      max_tokens: 10,
    });

    return {
      ok: true,
      hasAccess: true,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Vérifier si c'est une erreur d'accès
    if (
      errorMsg.includes("model") &&
      (errorMsg.includes("not found") || errorMsg.includes("access"))
    ) {
      return {
        ok: false,
        hasAccess: false,
        error: "Computer Use API not available. Requires special access from OpenAI.",
      };
    }

    return {
      ok: false,
      hasAccess: false,
      error: errorMsg,
    };
  }
}

/**
 * Test complet avec mock screenshot.
 */
export async function testComputerUseWithMock(): Promise<{
  ok: boolean;
  steps?: number;
  actions?: string[];
  error?: string;
}> {
  const hasAccess = await testComputerUseBackend();
  if (!hasAccess.ok) {
    return {
      ok: false,
      error: hasAccess.error,
    };
  }

  try {
    const actions: string[] = [];
    let steps = 0;

    // Générateur de screenshot mock
    let clickCount = 0;
    const getMockScreenshot = () => {
      clickCount++;
      return createMockScreenshot();
    };

    for await (const event of runComputerTask(
      "Find and click the submit button",
      getMockScreenshot,
      { environment: "browser" },
      3, // Max 3 steps for testing
    )) {
      steps++;

      if (event.type === "tool_call" && event.content) {
        try {
          const action = JSON.parse(event.content) as ComputerAction;
          actions.push(action.type);

          // Simuler l'exécution
          await mockExecuteAction(action);
        } catch {
          // Not valid JSON
        }
      }

      if (event.type === "idle") {
        break;
      }
    }

    return {
      ok: true,
      steps,
      actions,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
