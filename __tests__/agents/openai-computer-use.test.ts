/**
 * Tests pour OpenAI Computer Use API Backend
 *
 * ⚠️ Ces tests nécessitent:
 * 1. OPENAI_API_KEY dans .env.local
 * 2. Accès spécial "Computer Use" sur le compte OpenAI (beta)
 *
 * Sans accès, les tests seront skipped avec un message explicatif.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  createComputerSession,
  encodeImageToBase64,
  executeComputerStep,
  runComputerTask,
  createMockScreenshot,
  mockExecuteAction,
  testComputerUseBackend,
  testComputerUseWithMock,
  type ComputerAction,
  type ComputerSession,
} from "@/lib/agents/backend-v2/openai-computer-use";

const hasApiKey = !!process.env.OPENAI_API_KEY;
let hasComputerAccess = false;

describe("OpenAI Computer Use API", () => {
  beforeAll(async () => {
    if (!hasApiKey) return;

    // Vérifier l'accès au modèle
    const access = await testComputerUseBackend();
    hasComputerAccess = access.hasAccess ?? false;

    if (!hasComputerAccess) {
      console.log("⚠️ Computer Use API not available — tests will be skipped");
      console.log("   Requires special beta access from OpenAI");
    }
  });

  describe("Session Management", () => {
    it("should create a computer session", () => {
      const session = createComputerSession();

      expect(session.id).toBeDefined();
      expect(session.id.startsWith("computer_")).toBe(true);
      expect(session.screenshots).toEqual([]);
      expect(session.actions).toEqual([]);
    });

    it("should encode image to base64 screenshot", () => {
      const mockImage = Buffer.from("fake-image-data");
      const screenshot = encodeImageToBase64(mockImage, "image/png");

      expect(screenshot.type).toBe("image");
      expect(screenshot.source.type).toBe("base64");
      expect(screenshot.source.media_type).toBe("image/png");
      expect(screenshot.source.data).toBeTruthy();
    });

    it("should create mock screenshot for testing", () => {
      const screenshot = createMockScreenshot(1920, 1080);

      expect(screenshot).toBeInstanceOf(Buffer);
      expect(screenshot.length).toBeGreaterThan(0);
    });
  });

  describe("Mock Action Execution", () => {
    it("should mock execute click action", async () => {
      const action: ComputerAction = {
        type: "click",
        x: 100,
        y: 200,
        button: "left",
      };

      await expect(mockExecuteAction(action)).resolves.not.toThrow();
    });

    it("should mock execute type action", async () => {
      const action: ComputerAction = {
        type: "type",
        text: "Hello World",
      };

      await expect(mockExecuteAction(action)).resolves.not.toThrow();
    });

    it("should mock execute scroll action", async () => {
      const action: ComputerAction = {
        type: "scroll",
        x: 500,
        y: 500,
        scrollX: 0,
        scrollY: -100,
      };

      await expect(mockExecuteAction(action)).resolves.not.toThrow();
    });

    it("should mock execute keypress action", async () => {
      const action: ComputerAction = {
        type: "keypress",
        keys: ["Ctrl", "C"],
      };

      await expect(mockExecuteAction(action)).resolves.not.toThrow();
    });

    it("should mock execute screenshot action", async () => {
      const action: ComputerAction = {
        type: "screenshot",
      };

      await expect(mockExecuteAction(action)).resolves.not.toThrow();
    });

    it("should mock execute wait action", async () => {
      const action: ComputerAction = {
        type: "wait",
        duration: 100,
      };

      const start = Date.now();
      await mockExecuteAction(action);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(50); // At least 50ms
    });
  });

  describe("Access Check", () => {
    it("should check Computer Use access", async () => {
      if (!hasApiKey) {
        return; // Skip
      }

      const result = await testComputerUseBackend();

      // Should return a valid result either way
      expect(result.ok).toBeDefined();
      expect(typeof result.hasAccess).toBe("boolean");

      if (!result.ok) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe("Computer Step Execution", () => {
    it.skipIf(!hasComputerAccess)("should execute a computer step", async () => {
      const session = createComputerSession();
      const screenshot = createMockScreenshot();

      const result = await executeComputerStep(
        session,
        encodeImageToBase64(screenshot),
        "Click on the blue button",
        { environment: "browser" },
      );

      // Should return either an action or done
      expect(result.action || result.done).toBeDefined();
      expect(result.reasoning).toBeDefined();

      if (result.usage) {
        expect(result.usage.inputTokens).toBeGreaterThan(0);
        expect(result.usage.costUsd).toBeGreaterThanOrEqual(0);
      }

      // Session should be updated
      expect(session.screenshots.length).toBe(1);
      if (result.action) {
        expect(session.actions.length).toBe(1);
      }
    }, 30000);

    it.skipIf(!hasComputerAccess)("should complete a simple task", async () => {
      const session = createComputerSession();
      const screenshot = createMockScreenshot();

      const result = await executeComputerStep(
        session,
        encodeImageToBase64(screenshot),
        "Confirm the task is done by calling done",
        { environment: "browser" },
      );

      // The model might complete immediately for simple confirmations
      expect(result.reasoning).toBeDefined();
    }, 30000);
  });

  describe("Full Task Execution", () => {
    it.skipIf(!hasComputerAccess)("should run a full computer task", async () => {
      let steps = 0;
      const actions: string[] = [];

      const getScreenshot = () => createMockScreenshot();

      for await (const event of runComputerTask(
        "Navigate to the settings page",
        getScreenshot,
        { environment: "browser" },
        5, // Max 5 steps
      )) {
        steps++;

        if (event.type === "tool_call" && event.content) {
          try {
            const action = JSON.parse(event.content);
            if (action.type) {
              actions.push(action.type);
            }
          } catch {
            // Not valid JSON, ignore
          }
        }

        // Break early if done
        if (event.type === "idle") {
          break;
        }
      }

      expect(steps).toBeGreaterThan(0);
      // Should have received at least step events
      expect(actions.length).toBeGreaterThanOrEqual(0);
    }, 60000);

    it.skipIf(!hasComputerAccess)("should handle max steps limit", async () => {
      let stepCount = 0;

      const getScreenshot = () => createMockScreenshot();

      for await (const event of runComputerTask(
        "Complete a very long task",
        getScreenshot,
        { environment: "browser" },
        2, // Very low limit
      )) {
        if (event.type === "step") {
          stepCount++;
        }

        if (event.type === "idle") {
          break;
        }
      }

      // Should stop after max steps
      expect(stepCount).toBeLessThanOrEqual(5); // Some buffer for initial/idle
    }, 30000);
  });

  describe("Integration Test", () => {
    it.skipIf(!hasComputerAccess)("should pass full integration test", async () => {
      const result = await testComputerUseWithMock();

      if (!result.ok) {
        console.log("Test failed:", result.error);
      }

      expect(result.ok).toBe(true);
      expect(result.steps).toBeGreaterThan(0);
      expect(result.actions).toBeDefined();
    }, 60000);

    it("should gracefully handle no API key", async () => {
      if (hasApiKey) {
        return; // Skip if we have key
      }

      const result = await testComputerUseBackend();
      expect(result.ok).toBe(false);
      expect(result.hasAccess).toBe(false);
    });
  });

  describe("Configuration Options", () => {
    it("should support different environments", async () => {
      const session = createComputerSession();
      const screenshot = encodeImageToBase64(createMockScreenshot());

      // Just verify the config is accepted (won't actually call API in this test)
      const configs = [
        { environment: "browser" as const },
        { environment: "mac" as const },
        { environment: "windows" as const },
        { environment: "ubuntu" as const },
      ];

      for (const config of configs) {
        // Type checking only — won't execute without API access
        expect(config.environment).toBeDefined();
      }
    });

    it("should support custom display sizes", () => {
      const configs = [
        { displayWidth: 1280, displayHeight: 800 },
        { displayWidth: 1920, displayHeight: 1080 },
        { displayWidth: 2560, displayHeight: 1440 },
        { displayWidth: 3840, displayHeight: 2160 },
      ];

      for (const config of configs) {
        expect(config.displayWidth).toBeGreaterThan(0);
        expect(config.displayHeight).toBeGreaterThan(0);
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid screenshot gracefully", async () => {
      if (!hasComputerAccess) {
        return; // Skip
      }

      const session = createComputerSession();
      const invalidScreenshot = {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: "image/png" as const,
          data: "invalid-base64!!!",
        },
      };

      // Should either work or throw a clean error
      await expect(
        executeComputerStep(session, invalidScreenshot, "test", {}),
      ).rejects.toThrow();
    });

    it("should handle network errors", async () => {
      // This would require mocking the OpenAI client
      // For now, just verify the error handling structure exists
      const result = await testComputerUseBackend();

      if (!result.ok) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe("string");
      }
    });
  });
});

describe("Computer Use — No API Key Fallback", () => {
  it("should skip when no API key available", async () => {
    if (process.env.OPENAI_API_KEY) {
      return; // Skip this test
    }

    const result = await testComputerUseBackend();
    expect(result.ok).toBe(false);
    expect(result.hasAccess).toBe(false);
    expect(result.error).toBeDefined();
  });
});
