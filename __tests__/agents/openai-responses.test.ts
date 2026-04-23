/**
 * Tests pour OpenAI Responses API Backend
 *
 * ⚠️ Ces tests nécessitent OPENAI_API_KEY dans .env.local
 */

import { describe, it, expect } from "vitest";
import {
  generateResponse,
  streamResponse,
  quickResponse,
  quickStream,
  ResponsesSession,
  testResponsesBackend,
  testResponsesSession,
} from "@/lib/agents/backend-v2/openai-responses";

const hasApiKey = !!process.env.OPENAI_API_KEY;
const describeIf = hasApiKey ? describe : describe.skip;

describeIf("OpenAI Responses API", () => {
  describe("generateResponse (blocking)", () => {
    it("should generate a simple response", async () => {
      const result = await generateResponse(
        [{ role: "user", content: "Say 'pong'" }],
        { model: "gpt-4o-mini" },
      );

      expect(result.id).toBeDefined();
      expect(result.id.startsWith("resp_")).toBe(true);
      expect(result.text.toLowerCase()).toContain("pong");
      expect(result.usage.input_tokens).toBeGreaterThan(0);
      expect(result.usage.output_tokens).toBeGreaterThan(0);
      expect(result.costUsd).toBeGreaterThan(0);
    }, 10_000);

    it("should respect system prompt", async () => {
      const result = await generateResponse(
        [
          { role: "system", content: "You only speak in French." },
          { role: "user", content: "Say hello" },
        ],
        { model: "gpt-4o-mini" },
      );

      expect(result.text.length).toBeGreaterThan(0);
      // Should contain French greeting
      expect(
        ["bonjour", "salut", "bonsoir"].some(w => result.text.toLowerCase().includes(w)),
      ).toBe(true);
    }, 10_000);

    it("should track token usage accurately", async () => {
      const result = await generateResponse(
        [{ role: "user", content: "Count from 1 to 5." }],
        { model: "gpt-4o-mini" },
      );

      expect(result.usage.input_tokens).toBeGreaterThanOrEqual(5);
      expect(result.usage.output_tokens).toBeGreaterThanOrEqual(5);
      expect(result.costUsd).toBeLessThan(0.001); // Should be cheap
    }, 10_000);
  });

  describe("streamResponse", () => {
    it("should stream events", async () => {
      const events: Array<{ type: string; delta?: string; content?: string }> = [];

      for await (const event of streamResponse(
        [{ role: "user", content: "Count: 1, 2, 3" }],
        { model: "gpt-4o-mini" },
      )) {
        events.push({
          type: event.type,
          delta: "delta" in event ? event.delta : undefined,
          content: "content" in event ? event.content : undefined,
        });
      }

      // Should have step events
      expect(events.some(e => e.type === "step")).toBe(true);

      // Should have message events with deltas
      const messageEvents = events.filter(e => e.type === "message" && e.delta);
      expect(messageEvents.length).toBeGreaterThan(0);

      // Should end with idle
      expect(events[events.length - 1].type).toBe("idle");
    }, 15_000);

    it("should accumulate text correctly", async () => {
      let fullText = "";

      for await (const event of streamResponse(
        [{ role: "user", content: "Say 'streaming works'" }],
        { model: "gpt-4o-mini" },
      )) {
        if (event.type === "message" && event.delta) {
          fullText += event.delta;
        }
      }

      expect(fullText.toLowerCase()).toContain("streaming works");
    }, 10_000);
  });

  describe("Quick helpers", () => {
    it("quickResponse should return text directly", async () => {
      const text = await quickResponse("Say 'quick'", "gpt-4o-mini");

      expect(typeof text).toBe("string");
      expect(text.toLowerCase()).toContain("quick");
    }, 10_000);

    it("quickStream should yield chunks", async () => {
      const chunks: string[] = [];

      for await (const chunk of quickStream("Say 'stream'", "gpt-4o-mini")) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      const fullText = chunks.join("");
      expect(fullText.toLowerCase()).toContain("stream");
    }, 10_000);
  });

  describe("ResponsesSession", () => {
    it("should maintain conversation history", async () => {
      const session = new ResponsesSession("gpt-4o-mini");

      await session.send("My name is Alice.");
      await session.send("What is my name?");

      const history = session.getHistory();
      expect(history.length).toBe(4); // 2 user + 2 assistant messages
      expect(history[0].role).toBe("user");
      expect(history[1].role).toBe("assistant");
    }, 15_000);

    it("should handle multi-turn conversation", async () => {
      const session = new ResponsesSession("gpt-4o-mini");

      // First turn
      const r1 = await session.send("What is 5+5? Answer with just the number.");
      expect(r1.text).toContain("10");

      // Second turn (contextual)
      const r2 = await session.send("Add 10 to that.");
      expect(r2.text).toContain("20");

      // Should track cost
      expect(r1.costUsd).toBeGreaterThan(0);
      expect(r2.costUsd).toBeGreaterThan(0);
    }, 20_000);

    it("should support streaming in session", async () => {
      const session = new ResponsesSession("gpt-4o-mini");
      let fullText = "";

      for await (const event of session.sendStream("Count: A, B, C")) {
        if (event.type === "message" && event.delta) {
          fullText += event.delta;
        }
      }

      expect(fullText).toContain("A");
      expect(fullText).toContain("B");
      expect(fullText).toContain("C");

      // History should be updated
      expect(session.getHistory().length).toBe(2);
    }, 15_000);

    it("should clear history", async () => {
      const session = new ResponsesSession("gpt-4o-mini");

      await session.send("Hello");
      expect(session.getHistory().length).toBe(2);

      session.clear();
      expect(session.getHistory().length).toBe(0);
    });
  });

  describe("Integration tests", () => {
    it("should pass backend health test", async () => {
      const result = await testResponsesBackend();

      expect(result.ok).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.costUsd).toBeDefined();
      expect(result.error).toBeUndefined();
    }, 10_000);

    it("should pass session test", async () => {
      const result = await testResponsesSession();

      expect(result.ok).toBe(true);
      expect(result.conversation).toBeDefined();
      expect(result.conversation!.length).toBeGreaterThan(2);
      expect(result.totalCost).toBeGreaterThan(0);
    }, 20_000);
  });

  describe("Error handling", () => {
    it("should handle empty input gracefully", async () => {
      await expect(
        generateResponse([], { model: "gpt-4o-mini" }),
      ).rejects.toThrow();
    });

    it("should handle invalid model", async () => {
      await expect(
        generateResponse(
          [{ role: "user", content: "Hello" }],
          { model: "invalid-model-name" },
        ),
      ).rejects.toThrow();
    });
  });
});

describe("OpenAI Responses API (No API Key)", () => {
  it("should skip tests when no API key", async () => {
    if (process.env.OPENAI_API_KEY) {
      return; // Skip test
    }

    const result = await testResponsesBackend();
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
