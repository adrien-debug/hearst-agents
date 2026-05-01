/**
 * Browser Agent Loop (vague 9, action #4) — tests avec Anthropic mocké.
 *
 * Couvre :
 *  - Sequence multi-step : navigate → click → done
 *  - Tool execution mappée correctement à PlaywrightPage
 *  - extract retourne les données dans extractedData
 *  - abort signal stoppe la boucle
 *  - 5 échecs consécutifs → abort no-progress
 *  - max steps respecté
 *  - Pas de clé Anthropic → abort propre
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAgentLoop } from "@/lib/browser/agent-loop";
import { createFakePage } from "@/lib/browser/playwright-bridge";
import type { PlaywrightPage } from "@/lib/browser/playwright-bridge";

// ── Helpers : mock Anthropic ─────────────────────────────────

interface ScriptedToolCall {
  name: string;
  input: Record<string, unknown>;
}

/**
 * Simule un client Anthropic qui retourne une séquence prédéfinie de
 * tool_use blocks. Chaque appel à `messages.create` renvoie la prochaine
 * étape de `script`. Quand le script est épuisé, retourne un end_turn vide.
 */
function makeMockClient(script: ScriptedToolCall[]) {
  let cursor = 0;
  return {
    messages: {
      create: vi.fn(async () => {
        const next = script[cursor];
        cursor += 1;
        if (!next) {
          return {
            id: `msg-end-${cursor}`,
            type: "message" as const,
            role: "assistant" as const,
            model: "claude-sonnet-4-6",
            content: [{ type: "text" as const, text: "Done." }],
            stop_reason: "end_turn" as const,
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 5 },
          };
        }
        return {
          id: `msg-${cursor}`,
          type: "message" as const,
          role: "assistant" as const,
          model: "claude-sonnet-4-6",
          content: [
            {
              type: "tool_use" as const,
              id: `toolu_${cursor}`,
              name: next.name,
              input: next.input,
            },
          ],
          stop_reason: "tool_use" as const,
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      }),
    },
  };
}

// ── Helpers : Page espionne ──────────────────────────────────

function makeSpyPage(overrides: Partial<PlaywrightPage> = {}): PlaywrightPage {
  const base = createFakePage({
    url: "https://example.com",
    title: "Example",
    content: "<html><body>Welcome</body></html>",
  });
  return {
    ...base,
    goto: vi.fn(base.goto.bind(base)),
    click: vi.fn(base.click.bind(base)),
    fill: vi.fn(base.fill.bind(base)),
    waitForLoadState: vi.fn(base.waitForLoadState.bind(base)),
    title: vi.fn(base.title.bind(base)),
    content: vi.fn(base.content.bind(base)),
    url: vi.fn(base.url.bind(base)),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("runAgentLoop", () => {
  beforeEach(() => {
    // Pas besoin de clé pour les tests — le mockClient est passé en param
  });

  it("exécute une sequence navigate → done", async () => {
    const client = makeMockClient([
      { name: "navigate", input: { url: "https://acme.com", reason: "open homepage" } },
      { name: "done", input: { summary: "Page loaded", success: true } },
    ]);
    const page = makeSpyPage();
    const result = await runAgentLoop({
      task: "Open https://acme.com",
      page,
      anthropicClient: client as unknown as Parameters<typeof runAgentLoop>[0]["anthropicClient"],
    });

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].tool).toBe("navigate");
    expect(result.steps[0].result.ok).toBe(true);
    expect(result.steps[1].tool).toBe("done");
    expect(result.success).toBe(true);
    expect(result.summary).toBe("Page loaded");
    expect(page.goto).toHaveBeenCalledWith(
      "https://acme.com",
      expect.objectContaining({ waitUntil: "domcontentloaded" }),
    );
  });

  it("rejette navigate avec URL invalide", async () => {
    const client = makeMockClient([
      { name: "navigate", input: { url: "not-a-url", reason: "x" } },
      { name: "done", input: { summary: "Failed nav", success: false } },
    ]);
    const page = makeSpyPage();
    const result = await runAgentLoop({
      task: "x",
      page,
      anthropicClient: client as unknown as Parameters<typeof runAgentLoop>[0]["anthropicClient"],
    });

    expect(result.steps[0].result.ok).toBe(false);
    expect(result.steps[0].result.error).toContain("invalid url");
    expect(page.goto).not.toHaveBeenCalled();
  });

  it("appelle click sur la page avec le bon selector", async () => {
    const client = makeMockClient([
      { name: "click", input: { selector: "button.submit", reason: "submit form" } },
      { name: "done", input: { summary: "Clicked", success: true } },
    ]);
    const page = makeSpyPage();
    await runAgentLoop({
      task: "Click submit",
      page,
      anthropicClient: client as unknown as Parameters<typeof runAgentLoop>[0]["anthropicClient"],
    });
    expect(page.click).toHaveBeenCalledWith(
      "button.submit",
      expect.objectContaining({ timeout: 10_000 }),
    );
  });

  it("appelle fill avec selector + value", async () => {
    const client = makeMockClient([
      {
        name: "fill",
        input: { selector: "input[name=email]", value: "test@x.com", reason: "fill email" },
      },
      { name: "done", input: { summary: "Filled", success: true } },
    ]);
    const page = makeSpyPage();
    await runAgentLoop({
      task: "Fill email",
      page,
      anthropicClient: client as unknown as Parameters<typeof runAgentLoop>[0]["anthropicClient"],
    });
    expect(page.fill).toHaveBeenCalledWith(
      "input[name=email]",
      "test@x.com",
      expect.objectContaining({ timeout: 10_000 }),
    );
  });

  it("retourne extractedData quand le tool extract est utilisé", async () => {
    const fakeContent = "<html><body><h1>Acme</h1><p>Price: $99</p></body></html>";
    const page = makeSpyPage({
      content: vi.fn(async () => fakeContent),
    });
    // Mock extract returns valid JSON via Haiku call
    const client = {
      messages: {
        create: vi
          .fn()
          // 1er appel : tool_use extract
          .mockResolvedValueOnce({
            id: "m1",
            type: "message" as const,
            role: "assistant" as const,
            model: "x",
            content: [
              {
                type: "tool_use" as const,
                id: "tu1",
                name: "extract",
                input: { instruction: "page title and price" },
              },
            ],
            stop_reason: "tool_use" as const,
            stop_sequence: null,
            usage: { input_tokens: 100, output_tokens: 30 },
          })
          // 2e appel : Haiku interne pour extractStructured retourne JSON
          .mockResolvedValueOnce({
            id: "m2",
            type: "message" as const,
            role: "assistant" as const,
            model: "x",
            content: [
              { type: "text" as const, text: '{"title":"Acme","price":"$99"}' },
            ],
            stop_reason: "end_turn" as const,
            stop_sequence: null,
            usage: { input_tokens: 200, output_tokens: 20 },
          })
          // 3e appel : tool_use done
          .mockResolvedValueOnce({
            id: "m3",
            type: "message" as const,
            role: "assistant" as const,
            model: "x",
            content: [
              {
                type: "tool_use" as const,
                id: "tu2",
                name: "done",
                input: { summary: "Extracted", success: true },
              },
            ],
            stop_reason: "tool_use" as const,
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
      },
    };
    const result = await runAgentLoop({
      task: "Extract title and price",
      page,
      anthropicClient: client as unknown as Parameters<typeof runAgentLoop>[0]["anthropicClient"],
    });
    expect(result.extractedData).toEqual({ title: "Acme", price: "$99" });
    expect(result.success).toBe(true);
  });

  it("respecte maxSteps et marque aborted quand le cap est atteint", async () => {
    // Script infini de clicks — l'agent ne dira jamais "done"
    const infiniteClicks: ScriptedToolCall[] = Array.from({ length: 30 }, () => ({
      name: "click",
      input: { selector: "button", reason: "x" },
    }));
    const client = makeMockClient(infiniteClicks);
    const page = makeSpyPage();
    const result = await runAgentLoop({
      task: "Spam click",
      page,
      maxSteps: 5,
      anthropicClient: client as unknown as Parameters<typeof runAgentLoop>[0]["anthropicClient"],
    });
    expect(result.steps).toHaveLength(5);
    expect(result.aborted).toBe(true);
    expect(result.summary).toContain("cap");
  });

  it("appelle onStep callback pour chaque step exécuté", async () => {
    const client = makeMockClient([
      { name: "navigate", input: { url: "https://x.com", reason: "x" } },
      { name: "click", input: { selector: "a", reason: "x" } },
      { name: "done", input: { summary: "ok", success: true } },
    ]);
    const page = makeSpyPage();
    const onStep = vi.fn();
    await runAgentLoop({
      task: "x",
      page,
      onStep,
      anthropicClient: client as unknown as Parameters<typeof runAgentLoop>[0]["anthropicClient"],
    });
    expect(onStep).toHaveBeenCalledTimes(3);
    expect(onStep.mock.calls[0][0].tool).toBe("navigate");
    expect(onStep.mock.calls[1][0].tool).toBe("click");
    expect(onStep.mock.calls[2][0].tool).toBe("done");
  });

  it("abort via signal externe stoppe immédiatement", async () => {
    const controller = new AbortController();
    const client = {
      messages: {
        create: vi.fn(async () => {
          // Abort right before the first response
          controller.abort();
          return {
            id: "m1",
            type: "message" as const,
            role: "assistant" as const,
            model: "x",
            content: [
              {
                type: "tool_use" as const,
                id: "tu1",
                name: "navigate",
                input: { url: "https://x.com", reason: "x" },
              },
            ],
            stop_reason: "tool_use" as const,
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 5 },
          };
        }),
      },
    };
    const page = makeSpyPage();
    // Pre-abort
    controller.abort();
    const result = await runAgentLoop({
      task: "x",
      page,
      abortSignal: controller.signal,
      anthropicClient: client as unknown as Parameters<typeof runAgentLoop>[0]["anthropicClient"],
    });
    expect(result.aborted).toBe(true);
    expect(result.summary).toContain("interrompu");
  });

  it("abort no-progress après 5 échecs consécutifs", async () => {
    // 6 fills avec selector vide → chacun échoue. L'agent doit abort au 5e.
    const failingScript: ScriptedToolCall[] = Array.from({ length: 10 }, () => ({
      name: "fill",
      input: { selector: "", value: "x", reason: "x" },
    }));
    const client = makeMockClient(failingScript);
    const page = makeSpyPage();
    const result = await runAgentLoop({
      task: "x",
      page,
      maxSteps: 20,
      anthropicClient: client as unknown as Parameters<typeof runAgentLoop>[0]["anthropicClient"],
    });
    expect(result.aborted).toBe(true);
    expect(result.summary).toContain("échec");
    // Au plus 5 steps exécutés avant l'abort
    expect(result.steps.length).toBeLessThanOrEqual(5);
  });

  it("retourne aborted sans clé Anthropic ni client mocké", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const page = makeSpyPage();
      const result = await runAgentLoop({ task: "x", page });
      expect(result.aborted).toBe(true);
      expect(result.summary).toContain("ANTHROPIC_API_KEY");
    } finally {
      if (original) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("text-only response (pas de tool_use) termine la boucle", async () => {
    const client = {
      messages: {
        create: vi.fn(async () => ({
          id: "m1",
          type: "message" as const,
          role: "assistant" as const,
          model: "x",
          content: [
            { type: "text" as const, text: "Je n'ai pas assez d'info pour agir." },
          ],
          stop_reason: "end_turn" as const,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 10 },
        })),
      },
    };
    const page = makeSpyPage();
    const result = await runAgentLoop({
      task: "x",
      page,
      anthropicClient: client as unknown as Parameters<typeof runAgentLoop>[0]["anthropicClient"],
    });
    expect(result.steps).toHaveLength(0);
    expect(result.summary).toContain("pas assez");
  });
});
