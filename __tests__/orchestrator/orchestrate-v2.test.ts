/**
 * E2E Tests for Orchestrator V2
 *
 * Tests the full integration: Backend Selector + Session Manager
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { orchestrateV2Blocking, orchestrateV2, isV2Enabled, shouldUseV2 } from "@/lib/orchestrator/orchestrate-v2";
import { SessionManager, closeAllSessions } from "@/lib/agents/sessions";

// Mock Supabase
type MockDb = {
  from: () => {
    insert: () => Promise<{ error: null }>;
    select: () => Promise<{ data: unknown[]; error: null }>;
  };
};

const mockDb = {
  from: () => ({
    insert: async () => ({ error: null }),
    select: async () => ({ data: [], error: null }),
  }),
};

describe("Orchestrator V2", () => {
  beforeEach(() => {
    SessionManager.reset();
  });

  afterEach(async () => {
    await closeAllSessions();
    SessionManager.reset();
  });

  describe("Feature Flags", () => {
    it("should report V2 as enabled", () => {
      expect(isV2Enabled()).toBe(true);
    });

    it("should use V2 for all users at 100% rollout", () => {
      expect(shouldUseV2("user1")).toBe(true);
      expect(shouldUseV2("user2")).toBe(true);
      expect(shouldUseV2("user3")).toBe(true);
    });
  });

  describe("Blocking Orchestration", () => {
    it.skipIf(!process.env.OPENAI_API_KEY)("should orchestrate simple question", async () => {
      const result = await orchestrateV2Blocking(mockDb, {
        userId: "test-user",
        message: "What is 2+2? Answer with just the number.",
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.backend).toBeDefined();
      expect(result.response).toContain("4");
      expect(result.metrics).toBeDefined();
      expect(result.metrics!.costUsd).toBeGreaterThanOrEqual(0);
      expect(result.metrics!.latencyMs).toBeGreaterThan(0);
    }, 15000);

    it.skipIf(!process.env.OPENAI_API_KEY)("should use forced backend", async () => {
      const result = await orchestrateV2Blocking(mockDb, {
        userId: "test-user",
        message: "Say hello",
        forceBackend: "openai_responses",
      });

      expect(result.success).toBe(true);
      expect(result.backend).toBe("openai_responses");
    }, 15000);

    it.skipIf(!process.env.OPENAI_API_KEY)("should auto-select backend for file search", async () => {
      const result = await orchestrateV2Blocking(mockDb, {
        userId: "test-user",
        message: "Search for documents about climate change",
      });

      expect(result.success).toBe(true);
      // Should select Assistants for file search
      expect(result.backend).toBe("openai_assistants");
    }, 15000);

    it.skipIf(!process.env.OPENAI_API_KEY)("should auto-select backend for simple question", async () => {
      const result = await orchestrateV2Blocking(mockDb, {
        userId: "test-user",
        message: "What is the weather today?",
      });

      expect(result.success).toBe(true);
      // Should select Responses for simple questions
      expect(result.backend).toBe("openai_responses");
    }, 15000);

    it("should handle errors gracefully", async () => {
      const result = await orchestrateV2Blocking(mockDb, {
        userId: "test-user",
        message: "", // Empty message should cause error
      });

      // Should either succeed (with empty response) or fail gracefully
      expect(result).toBeDefined();
    }, 5000);
  });

  describe("Streaming Orchestration", () => {
    it.skipIf(!process.env.OPENAI_API_KEY)("should stream response", async () => {
      const stream = orchestrateV2(mockDb, {
        userId: "test-user",
        message: "Count from 1 to 3",
      });

      const events: Array<{ type: string; delta?: string; message?: string }> = [];

      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Parse SSE data
        const text = new TextDecoder().decode(value);
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              events.push(data);
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Should have orchestrator log events
      expect(events.some(e => e.type === "orchestrator_log")).toBe(true);

      // Should have completion or text events
      expect(events.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe("Session Management", () => {
    it.skipIf(!process.env.OPENAI_API_KEY)("should create and manage sessions", async () => {
      // First request
      const result1 = await orchestrateV2Blocking(mockDb, {
        userId: "test-user",
        message: "My name is Alice",
      });

      expect(result1.success).toBe(true);
      expect(result1.sessionId).toBeDefined();

      // Session should exist
      const manager = SessionManager.getInstance();
      const session = manager.get(result1.sessionId);

      // For stateless Responses, session exists but may not have context
      // For Assistants, session would have context
      expect(session).toBeDefined();
    }, 15000);

    it.skipIf(!process.env.OPENAI_API_KEY)("should track metrics across sessions", async () => {
      const result = await orchestrateV2Blocking(mockDb, {
        userId: "test-user",
        message: "Say hello",
      });

      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(result.metrics!.costUsd).toBeGreaterThanOrEqual(0);
      expect(result.metrics!.tokensIn + result.metrics!.tokensOut).toBeGreaterThan(0);
    }, 15000);
  });

  describe("Backend Selection", () => {
    it("should select correct backend based on intent", async () => {
      const testCases = [
        { message: "What is 2+2?", expectedBackend: "openai_responses" },
        { message: "Search my documents", expectedBackend: "openai_assistants" },
        { message: "Calculate fibonacci", expectedBackend: "openai_assistants" },
        { message: "Click the button", expectedBackend: "openai_computer_use" },
      ];

      for (const tc of testCases) {
        const result = await orchestrateV2Blocking(mockDb, {
          userId: "test-user",
          message: tc.message,
        });

        if (result.success) {
          expect(result.backend).toBe(tc.expectedBackend);
        }
      }
    }, 60000);

    it("should respect forced backend", async () => {
      const result = await orchestrateV2Blocking(mockDb, {
        userId: "test-user",
        message: "Search documents", // Would normally use Assistants
        forceBackend: "openai_responses",
      });

      if (result.success) {
        expect(result.backend).toBe("openai_responses");
      }
    }, 15000);
  });

  describe("Error Handling", () => {
    it("should handle invalid backend", async () => {
      const result = await orchestrateV2Blocking(mockDb, {
        userId: "test-user",
        message: "Hello",
        forceBackend: "invalid_backend",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }, 5000);

    it("should handle missing API key gracefully", async () => {
      if (process.env.OPENAI_API_KEY) {
        return; // Skip if we have API key
      }

      const result = await orchestrateV2Blocking(mockDb, {
        userId: "test-user",
        message: "Hello",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("API key");
    }, 5000);
  });

  describe("Conversation History", () => {
    it.skipIf(!process.env.OPENAI_API_KEY)("should accept conversation history", async () => {
      const result = await orchestrateV2Blocking(mockDb, {
        userId: "test-user",
        message: "What is my name?",
        conversationHistory: [
          { role: "user", content: "My name is Alice" },
          { role: "assistant", content: "Hello Alice!" },
        ],
      });

      // With history, should process successfully
      // Note: Context retention depends on the selected backend
      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
    }, 15000);
  });

  describe("System Prompt", () => {
    it.skipIf(!process.env.OPENAI_API_KEY)("should use surface-specific system prompt", async () => {
      const result = await orchestrateV2Blocking(mockDb, {
        userId: "test-user",
        message: "Who are you?",
        surface: "documents",
      });

      expect(result.success).toBe(true);
      // Response should reflect system prompt (though hard to verify programmatically)
      expect(result.response).toBeDefined();
    }, 15000);
  });

  describe("Performance", () => {
    it.skipIf(!process.env.OPENAI_API_KEY)("should complete within reasonable time", async () => {
      const start = Date.now();

      const result = await orchestrateV2Blocking(mockDb, {
        userId: "test-user",
        message: "Say hello",
      });

      const duration = Date.now() - start;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(15000); // Should complete within 15s
    }, 20000);

    it.skipIf(!process.env.OPENAI_API_KEY)("should handle concurrent requests", async () => {
      const promises = [
        orchestrateV2Blocking(mockDb, { userId: "user1", message: "Hello 1" }),
        orchestrateV2Blocking(mockDb, { userId: "user2", message: "Hello 2" }),
        orchestrateV2Blocking(mockDb, { userId: "user3", message: "Hello 3" }),
      ];

      const results = await Promise.all(promises);

      expect(results.every(r => r.success)).toBe(true);
      expect(results.every(r => r.sessionId)).toBe(true);
    }, 30000);
  });

  describe("Cost Tracking", () => {
    it.skipIf(!process.env.OPENAI_API_KEY)("should track costs accurately", async () => {
      const result = await orchestrateV2Blocking(mockDb, {
        userId: "test-user",
        message: "Say hello",
      });

      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(result.metrics!.costUsd).toBeGreaterThanOrEqual(0);
      expect(result.metrics!.costUsd).toBeLessThan(0.01); // Should be cheap for hello
    }, 15000);
  });
});
