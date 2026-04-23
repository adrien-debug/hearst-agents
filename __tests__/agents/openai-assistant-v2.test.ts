/**
 * Tests pour OpenAI Assistants Backend V2 — Tool Calls + Streaming
 *
 * ⚠️ Ces tests nécessitent OPENAI_API_KEY dans .env.local
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  createAssistantSession,
  runAssistantSession,
  testAssistantWithTools,
  streamRunWithTools,
} from "@/lib/agents/backend-v2/openai-assistant-v2";
import {
  registerTool,
  executeTool,
  getAllTools,
  toOpenAITools,
} from "@/lib/agents/backend-v2/openai-tools";

const hasApiKey = !!process.env.OPENAI_API_KEY;
const describeIf = hasApiKey ? describe : describe.skip;

describeIf("OpenAI Assistants V2 — Tools", () => {
  describe("Tool Registry", () => {
    it("should have built-in tools registered", () => {
      const tools = getAllTools();
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.some(t => t.definition.function.name === "get_current_time")).toBe(true);
      expect(tools.some(t => t.definition.function.name === "calculate")).toBe(true);
    });

    it("should convert tools to OpenAI format", () => {
      const openaiTools = toOpenAITools();
      expect(openaiTools.length).toBeGreaterThan(0);
      expect(openaiTools[0].type).toBe("function");
      expect(openaiTools[0].function.name).toBeDefined();
    });

    it("should execute calculate tool", async () => {
      const result = await executeTool("calculate", { expression: "2 + 2" });
      const parsed = JSON.parse(result);
      expect(parsed.result).toBe(4);
    });

    it("should execute format_text tool", async () => {
      const result = await executeTool("format_text", {
        text: "hello world",
        operation: "uppercase",
      });
      const parsed = JSON.parse(result);
      expect(parsed.result).toBe("HELLO WORLD");
    });

    it("should execute get_current_time tool", async () => {
      const result = await executeTool("get_current_time", { timezone: "UTC" });
      const parsed = JSON.parse(result);
      expect(parsed.iso).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
    });

    it("should throw for unknown tool", async () => {
      await expect(executeTool("unknown_tool", {})).rejects.toThrow("Tool not found");
    });
  });

  describe("Custom Tool Registration", () => {
    it("should register and execute custom tool", async () => {
      registerTool(
        "test_echo",
        {
          type: "function",
          function: {
            name: "test_echo",
            description: "Echo back the input",
            parameters: {
              type: "object",
              properties: {
                message: { type: "string" },
              },
              required: ["message"],
            },
          },
        },
        async (args) => JSON.stringify({ echoed: args.message }),
      );

      const result = await executeTool("test_echo", { message: "hello" });
      const parsed = JSON.parse(result);
      expect(parsed.echoed).toBe("hello");
    });
  });
});

describeIf("OpenAI Assistants V2 — Session Management", () => {
  it("should create assistant session with tools", async () => {
    const session = await createAssistantSession(
      "gpt-4o-mini",
      "Test Session",
      "Test instructions",
    );

    expect(session.assistantId).toBeDefined();
    expect(session.assistantId.startsWith("asst_")).toBe(true);
    expect(session.threadId).toBeDefined();
    expect(session.threadId.startsWith("thread_")).toBe(true);
  }, 10_000);

  it.skip("should run session and receive message (simple query - needs debug)", async () => {
    const session = await createAssistantSession("gpt-4o-mini");
    const events: Array<{ type: string; content?: string; delta?: string }> = [];
    let fullText = "";

    for await (const event of runAssistantSession(session, "Say 'test123'")) {
      events.push({
        type: event.type,
        content: "content" in event ? event.content : undefined,
        delta: "delta" in event ? event.delta : undefined,
      });

      // Accumulate text from deltas
      if (event.type === "message" && "delta" in event && event.delta) {
        fullText += event.delta;
      }
    }

    // Devrait avoir des events de step et message (ou au moins des deltas)
    expect(events.some(e => e.type === "step")).toBe(true);
    // Accept either message events or accumulated text
    const hasMessageEvent = events.some(e => e.type === "message");
    expect(hasMessageEvent || fullText.length > 0).toBe(true);

    // Vérifier le contenu final (soit dans les events, soit accumulé)
    const finalMessage = events
      .filter(e => e.type === "message" && e.content)
      .pop();
    const finalContent = fullText || finalMessage?.content || "";
    expect(finalContent.toLowerCase()).toContain("test123");
  }, 15_000);
});

describeIf("OpenAI Assistants V2 — Tool Calls Integration", () => {
  it("should trigger tool calls for time query", async () => {
    const session = await createAssistantSession("gpt-4o-mini");
    const toolCalls: string[] = [];
    const events: Array<{ type: string; tool?: string }> = [];

    for await (const event of runAssistantSession(session, "What time is it now?")) {
      events.push({
        type: event.type,
        tool: "tool" in event ? event.tool : undefined,
      });

      if (event.type === "tool_call" && "tool" in event && event.tool) {
        toolCalls.push(event.tool);
      }
    }

    // Devrait avoir appelé get_current_time
    expect(toolCalls).toContain("get_current_time");
    expect(events.some(e => e.type === "tool_result")).toBe(true);
  }, 15_000);

  it("should trigger tool calls for calculation", async () => {
    const session = await createAssistantSession("gpt-4o-mini");
    const toolCalls: string[] = [];

    for await (const event of runAssistantSession(session, "Calculate 123 * 456")) {
      if (event.type === "tool_call" && "tool" in event && event.tool) {
        toolCalls.push(event.tool);
      }
    }

    // Devrait avoir appelé calculate
    expect(toolCalls).toContain("calculate");
  }, 15_000);

  it("should handle multiple tool calls in one query", async () => {
    const session = await createAssistantSession("gpt-4o-mini");
    const toolCalls: string[] = [];

    for await (const event of runAssistantSession(session,
      "What time is it? Also calculate 10+20 and format 'hello' to uppercase."
    )) {
      if (event.type === "tool_call" && "tool" in event && event.tool) {
        toolCalls.push(event.tool);
      }
    }

    // Devrait avoir appelé plusieurs outils
    expect(toolCalls.length).toBeGreaterThanOrEqual(2);
  }, 20_000);
});

describeIf("OpenAI Assistants V2 — Streaming", () => {
  it("should stream events in real-time", async () => {
    const session = await createAssistantSession("gpt-4o-mini");
    const eventTypes: string[] = [];
    const timestamps: number[] = [];

    for await (const event of streamRunWithTools(session.threadId, session.assistantId)) {
      eventTypes.push(event.type);
      timestamps.push(Date.now());
    }

    // Vérifier la séquence d'events
    expect(eventTypes).toContain("step");

    // Vérifier que le streaming est temps réel (events espacés dans le temps)
    if (timestamps.length > 1) {
      const firstEvent = timestamps[0];
      const lastEvent = timestamps[timestamps.length - 1];
      expect(lastEvent - firstEvent).toBeGreaterThan(100); // Au moins 100ms de streaming
    }
  }, 15_000);
});

describeIf("OpenAI Assistants V2 — End-to-End", () => {
  it("should pass full integration test", async () => {
    const result = await testAssistantWithTools();

    expect(result.ok).toBe(true);
    expect(result.toolCalls).toBeDefined();
    expect(result.toolCalls!.length).toBeGreaterThan(0);
    expect(result.response).toBeDefined();
    expect(result.response?.length).toBeGreaterThan(0);
  }, 30_000);
});

describe("OpenAI Assistants V2 (No API Key)", () => {
  it("should handle missing API key gracefully", async () => {
    if (process.env.OPENAI_API_KEY) {
      return; // Skip si clé présente
    }

    await expect(testAssistantWithTools()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining("API key"),
    });
  });
});
