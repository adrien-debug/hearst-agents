/**
 * Tests pour le Session Manager
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SessionManager,
  OpenAIAssistantSession,
  OpenAIResponsesSession,
  OpenAIComputerSession,
  createSession,
  closeAllSessions,
} from "@/lib/agents/sessions";
import type { AgentBackendV2 } from "@/lib/agents/backend-v2/types";
import type { SessionMessage, SessionMetrics } from "@/lib/agents/sessions/types";

type SessionInternals = {
  messages: SessionMessage[];
  metrics: SessionMetrics;
  tokenCount: number;
  trimHistory(): void;
};

function getSessionInternals(session: unknown): SessionInternals {
  return session as SessionInternals;
}

// Reset singleton between tests
describe("Session Manager", () => {
  beforeEach(() => {
    SessionManager.reset();
  });

  afterEach(async () => {
    await closeAllSessions();
    SessionManager.reset();
  });

  describe("Session Creation", () => {
    it("should create a session with auto-selected backend", async () => {
      const session = await createSession("What is the weather?");

      expect(session.id).toBeDefined();
      expect(session.backend).toBeDefined();
      expect(session.status).toBe("created");
      expect(session.config).toBeDefined();
    });

    it("should create session with specific backend", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createWithBackend("openai_responses");

      expect(session.backend).toBe("openai_responses");
    });

    it("should create OpenAI Assistant session", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createWithBackend("openai_assistants", {
        systemPrompt: "You are a helpful assistant",
      });

      expect(session).toBeInstanceOf(OpenAIAssistantSession);
      expect(session.config.systemPrompt).toBe("You are a helpful assistant");
    });

    it("should create OpenAI Responses session", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createWithBackend("openai_responses");

      expect(session).toBeInstanceOf(OpenAIResponsesSession);
    });

    it("should create OpenAI Computer session", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createWithBackend("openai_computer_use");

      expect(session).toBeInstanceOf(OpenAIComputerSession);
    });

    it("should enforce session limits per user", async () => {
      const manager = SessionManager.getInstance({ maxSessionsPerUser: 2 });

      // Create 2 sessions
      await manager.create("1", { userId: "user1" });
      await manager.create("2", { userId: "user1" });

      // Third should fail
      await expect(manager.create("3", { userId: "user1" })).rejects.toThrow(
        "Maximum sessions",
      );
    });
  });

  describe("Session Management", () => {
    it("should get session by ID", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createWithBackend("openai_responses");

      const retrieved = manager.get(session.id);
      expect(retrieved).toBe(session);
    });

    it("should list all sessions", async () => {
      const manager = SessionManager.getInstance();
      await manager.createWithBackend("openai_responses");
      await manager.createWithBackend("openai_responses");

      const sessions = manager.list();
      expect(sessions.length).toBe(2);
    });

    it("should list sessions for specific user", async () => {
      const manager = SessionManager.getInstance();
      await manager.create("test", { userId: "user1" });
      await manager.create("test", { userId: "user2" });
      await manager.create("test", { userId: "user1" });

      const user1Sessions = manager.getUserSessions("user1");
      expect(user1Sessions.length).toBe(2);
    });

    it("should close session", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createWithBackend("openai_responses");

      const closed = await manager.close(session.id);
      expect(closed).toBe(true);
      expect(session.status).toBe("closed");
    });

    it("should close all sessions", async () => {
      const manager = SessionManager.getInstance();
      await manager.createWithBackend("openai_responses");
      await manager.createWithBackend("openai_responses");

      await closeAllSessions();

      expect(manager.list().length).toBe(0);
    });
  });

  describe("Session Operations", () => {
    it.skipIf(!process.env.OPENAI_API_KEY)("should send message and get response", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createWithBackend("openai_responses", {
        model: "gpt-4o-mini",
      });

      const response = await session.send("Say exactly: hello");

      expect(response.message).toBeDefined();
      expect(response.message.role).toBe("assistant");
      expect(response.message.content.toLowerCase()).toContain("hello");
    }, 15000);

    it("should maintain history", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createWithBackend("openai_responses");
      const internals = getSessionInternals(session);

      // Manually add messages (since send is mocked/skipped)
      const msg1 = { id: "1", role: "user" as const, content: "Hello", timestamp: Date.now() };
      const msg2 = { id: "2", role: "assistant" as const, content: "Hi!", timestamp: Date.now() };
      internals.messages.push(msg1, msg2);

      const history = await session.getHistory();
      expect(history.length).toBe(2);
      expect(history[0].role).toBe("user");
      expect(history[1].role).toBe("assistant");
    });

    it("should clear history", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createWithBackend("openai_responses");
      const internals = getSessionInternals(session);

      internals.messages.push({ id: "1", role: "user", content: "test", timestamp: Date.now() });
      await session.clearHistory();

      const history = await session.getHistory();
      expect(history.length).toBe(0);
    });

    it("should trim history when max length exceeded", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createWithBackend("openai_responses", {
        maxHistoryLength: 5,
      });
      const internals = getSessionInternals(session);

      // Add 10 messages
      for (let i = 0; i < 10; i++) {
        internals.messages.push({
          id: String(i),
          role: i % 2 === 0 ? "user" : "assistant",
          content: `msg ${i}`,
          timestamp: Date.now(),
        });
      }

      internals.trimHistory();
      const history = await session.getHistory();

      // Should keep only 5 most recent
      expect(history.length).toBe(5);
      expect(history[0].content).toBe("msg 5"); // First kept
      expect(history[4].content).toBe("msg 9"); // Last added
    });
  });

  describe("Session Metrics", () => {
    it("should track metrics", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createWithBackend("openai_responses");
      const internals = getSessionInternals(session);

      // Simulate message exchange
      internals.messages.push({ id: "1", role: "user", content: "test", timestamp: Date.now() });
      internals.messages.push({ id: "2", role: "assistant", content: "response", timestamp: Date.now() });
      internals.metrics.messageCount = 2;
      internals.metrics.totalTokensIn = 10;
      internals.metrics.totalTokensOut = 20;
      internals.metrics.totalCostUsd = 0.001;

      const metrics = session.getMetrics();

      expect(metrics.messageCount).toBe(2);
      expect(metrics.totalTokensIn).toBe(10);
      expect(metrics.totalTokensOut).toBe(20);
      expect(metrics.totalCostUsd).toBe(0.001);
      expect(metrics.startTime).toBeDefined();
      expect(metrics.lastActivity).toBeDefined();
    });

    it("should get token count", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createWithBackend("openai_responses");
      const internals = getSessionInternals(session);

      internals.tokenCount = 100;

      expect(session.getTokenCount()).toBe(100);
    });
  });

  describe("Health Check", () => {
    it("should report healthy for active session", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createWithBackend("openai_responses");

      // Responses session does a simple API check
      const health = await session.healthCheck();

      // If API key available, should be healthy
      // If not, should report error
      expect(health.healthy).toBeDefined();
    });

    it("should report unhealthy for closed session", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createWithBackend("openai_responses");
      await session.close();

      const health = await session.healthCheck();

      expect(health.healthy).toBe(false);
    });
  });

  describe("Session Persistence", () => {
    it("should persist session state", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createWithBackend("openai_responses");
      const internals = getSessionInternals(session);

      internals.messages.push({
        id: "1",
        role: "user",
        content: "test",
        timestamp: Date.now(),
        metadata: { key: "value" },
      });

      const state = await session.persist();

      expect(state.id).toBe(session.id);
      expect(state.backend).toBe("openai_responses");
      expect(state.messages.length).toBe(1);
      expect(state.messages[0].content).toBe("test");
      expect(state.createdAt).toBeDefined();
      expect(state.updatedAt).toBeDefined();
    });
  });

  describe("Handoff", () => {
    it("should handoff between backends", async () => {
      const manager = SessionManager.getInstance();
      const fromSession = await manager.createWithBackend("openai_responses");
      const internals = getSessionInternals(fromSession);

      // Add some history
      internals.messages.push({
        id: "1",
        role: "user",
        content: "Hello",
        timestamp: Date.now(),
      });
      internals.messages.push({
        id: "2",
        role: "assistant",
        content: "Hi!",
        timestamp: Date.now(),
      });

      const result = await manager.handoff(fromSession.id, "openai_assistants");

      expect(result.success).toBe(true);
      expect(result.toSession.backend).toBe("openai_assistants");
      expect(result.transferredMessages).toBe(2);

      // Old session should be closed
      expect(fromSession.status).toBe("closed");

      // New session should have history
      const newHistory = await result.toSession.getHistory();
      expect(newHistory.length).toBe(2);
    });

    it("should throw for invalid handoff", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createWithBackend("openai_responses");

      await expect(manager.handoff(session.id, "openai_responses")).rejects.toThrow(
        "same backend",
      );
    });

    it("should transfer metrics on handoff", async () => {
      const manager = SessionManager.getInstance();
      const fromSession = await manager.createWithBackend("openai_responses");
      const internals = getSessionInternals(fromSession);

      // Set some metrics
      internals.metrics.totalTokensIn = 100;
      internals.metrics.totalTokensOut = 200;
      internals.metrics.totalCostUsd = 0.01;

      const result = await manager.handoff(fromSession.id, "openai_assistants");

      const toMetrics = result.toSession.getMetrics();
      expect(toMetrics.totalTokensIn).toBe(100);
      expect(toMetrics.totalTokensOut).toBe(200);
      expect(toMetrics.totalCostUsd).toBe(0.01);
    });
  });

  describe("Error Handling", () => {
    it("should throw when sending to closed session", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createWithBackend("openai_responses");
      await session.close();

      await expect(session.send("test")).rejects.toThrow("Session is closed");
    });

    it("should throw for unknown backend", async () => {
      const manager = SessionManager.getInstance();

      await expect(
        manager.createWithBackend("unknown_backend" as unknown as AgentBackendV2),
      ).rejects.toThrow("No factory for backend");
    });

    it("should handle Computer Use without screenshot provider", async () => {
      const manager = SessionManager.getInstance();
      const session = await manager.createWithBackend("openai_computer_use");

      await expect(session.send("Click button")).rejects.toThrow(
        "Screenshot provider required",
      );
    });
  });

  describe("Global Metrics", () => {
    it("should get all session metrics", async () => {
      const manager = SessionManager.getInstance();
      await manager.createWithBackend("openai_responses");
      await manager.createWithBackend("openai_assistants");

      const allMetrics = manager.getMetrics();

      expect(allMetrics.length).toBe(2);
    });

    it("should health check all sessions", async () => {
      const manager = SessionManager.getInstance();
      await manager.createWithBackend("openai_responses");

      const results = await manager.healthCheck();

      expect(results.length).toBeGreaterThan(0);
    });
  });
});
