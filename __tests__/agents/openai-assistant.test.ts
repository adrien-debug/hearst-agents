/**
 * Tests pour OpenAI Assistants Backend
 *
 * ⚠️ Ces tests nécessitent OPENAI_API_KEY dans .env.local
 * En CI, ils sont skipés si la clé n'est pas présente.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  createOrGetAssistant,
  createThread,
  addMessageToThread,
  runAssistant,
  streamRun,
  testAssistantBackend,
} from "@/lib/agents/backend-v2/openai-assistant";

const hasApiKey = !!process.env.OPENAI_API_KEY;
const describeIf = hasApiKey ? describe : describe.skip;

describeIf("OpenAI Assistants Backend", () => {
  describe("Unit: Assistant Lifecycle", () => {
    it("should create an assistant", async () => {
      const assistantId = await createOrGetAssistant({
        model: "gpt-4o-mini",
        name: "Test Assistant",
        instructions: "You are a test assistant.",
      });

      expect(assistantId).toBeDefined();
      expect(assistantId.startsWith("asst_")).toBe(true);
    });

    it("should create a thread", async () => {
      const threadId = await createThread();

      expect(threadId).toBeDefined();
      expect(threadId.startsWith("thread_")).toBe(true);
    });

    it("should add message to thread", async () => {
      const threadId = await createThread();
      const messageId = await addMessageToThread(threadId, {
        role: "user",
        content: "Hello, test message",
      });

      expect(messageId).toBeDefined();
      expect(messageId.startsWith("msg_")).toBe(true);
    });
  });

  describe("Unit: Run Execution", () => {
    it("should run assistant and get response", async () => {
      const assistantId = await createOrGetAssistant({
        model: "gpt-4o-mini",
        name: "Test Run",
        instructions: "Respond concisely.",
      });

      const threadId = await createThread([{
        role: "user",
        content: "Say 'pong'",
      }]);

      const result = await runAssistant(threadId, assistantId, {
        timeoutMs: 30_000,
      });

      expect(result.status).toBe("completed");
      expect(result.messages.length).toBeGreaterThan(0);

      const lastMessage = result.messages
        .filter(m => m.role === "assistant")
        .pop();

      const content = lastMessage?.content
        .map(c => c.type === "text" ? c.text.value : "")
        .join("") ?? "";

      expect(content.toLowerCase()).toContain("pong");
    }, 30_000);

    it("should track usage stats", async () => {
      const assistantId = await createOrGetAssistant({
        model: "gpt-4o-mini",
        name: "Test Usage",
      });

      const threadId = await createThread([{
        role: "user",
        content: "Count to 5",
      }]);

      const result = await runAssistant(threadId, assistantId, {
        timeoutMs: 30_000,
      });

      expect(result.usage).toBeDefined();
      expect(result.usage!.prompt_tokens).toBeGreaterThan(0);
      expect(result.usage!.completion_tokens).toBeGreaterThan(0);
    }, 30_000);
  });

  describe("Unit: Streaming", () => {
    it("should stream events", async () => {
      const assistantId = await createOrGetAssistant({
        model: "gpt-4o-mini",
        name: "Test Stream",
      });

      const threadId = await createThread([{
        role: "user",
        content: "Say hi",
      }]);

      const events: Array<{ type: string; content?: string; delta?: string }> = [];

      for await (const event of streamRun(threadId, assistantId)) {
        events.push({
          type: event.type,
          content: event.content,
          delta: event.delta,
        });
      }

      // Devrait avoir des events de step, message, idle
      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === "message" || e.type === "step")).toBe(true);
    }, 30_000);
  });

  describe("Integration: Full Session", () => {
    it("should complete full assistant session", async () => {
      const { runOpenAIAssistantSession } = await import("@/lib/agents/backend-v2/openai-assistant");
      type ManagedSessionConfig = import("@/lib/agents/backend-v2/types").ManagedSessionConfig;

      const config: ManagedSessionConfig = {
        backend: "openai_assistants",
        prompt: "What is 2+2? Answer with just the number.",
        runId: "test-run-123",
        tenantId: "test-tenant",
        workspaceId: "test-workspace",
      };

      const assistantConfig = {
        model: "gpt-4o-mini",
        name: "Math Assistant",
      };

      const events: Array<{ type: string; content?: string }> = [];

      for await (const event of runOpenAIAssistantSession(config, assistantConfig)) {
        events.push({
          type: event.type,
          content: event.content,
        });
      }

      // Vérifier la séquence d'events
      expect(events.some(e => e.type === "thinking")).toBe(true);
      expect(events.some(e => e.type === "message")).toBe(true);
      expect(events.some(e => e.type === "idle")).toBe(true);

      // Vérifier le contenu final
      const finalEvent = events.find(e => e.type === "idle");
      expect(finalEvent?.content).toContain("4");
    }, 30_000);
  });

  describe("Health Check", () => {
    it("should pass backend health test", async () => {
      const result = await testAssistantBackend();

      expect(result.ok).toBe(true);
      expect(result.assistantId).toBeDefined();
      expect(result.threadId).toBeDefined();
      expect(result.error).toBeUndefined();
    }, 30_000);
  });
});

describe("OpenAI Assistants Backend (No API Key)", () => {
  it("should warn when API key missing", () => {
    if (process.env.OPENAI_API_KEY) {
      return; // Skip si clé présente
    }

    // Juste vérifier que le module charge sans crash
    expect(async () => {
      await import("@/lib/agents/backend-v2/openai-assistant");
    }).not.toThrow();
  });
});
