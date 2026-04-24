/**
 * Tests pour le Backend Selector
 */

import { describe, it, expect } from "vitest";
import {
  analyzeTask,
  scoreBackends,
  selectBackend,
  planHybridExecution,
  isBackendAvailable,
  listAvailableBackends,
  recommendFor,
  testSelector,
  testHybridPlanning,
  type TaskAnalysis,
} from "@/lib/agents/backend-v2/selector";
import type { AgentBackendV2 } from "@/lib/agents/backend-v2/types";

describe("Backend Selector", () => {
  describe("analyzeTask", () => {
    it("should detect simple QA", () => {
      const analysis = analyzeTask({ prompt: "What is 2+2?" });

      expect(analysis.isSimpleQa).toBe(true);
      expect(analysis.complexity).toBeLessThan(30);
      expect(analysis.needsPersistence).toBe(false);
    });

    it("should detect file search need", () => {
      const analysis = analyzeTask({ prompt: "Find documents about climate" });

      expect(analysis.needsFileSearch).toBe(true);
      expect(analysis.complexity).toBeGreaterThan(20);
    });

    it("should detect code interpreter need", () => {
      const analysis = analyzeTask({ prompt: "Calculate fibonacci in Python" });

      expect(analysis.needsCodeInterpreter).toBe(true);
      expect(analysis.needsTools).toBe(true);
    });

    it("should detect vision need", () => {
      const analysis = analyzeTask({ prompt: "Look at this screenshot" });

      expect(analysis.needsVision).toBe(true);
    });

    it("should detect computer use need", () => {
      const analysis = analyzeTask({ prompt: "Click the login button" });

      expect(analysis.needsComputerUse).toBe(true);
    });

    it("should detect conversation context", () => {
      const analysis = analyzeTask(
        { prompt: "Continue our discussion" },
        [{ role: "user", content: "Hello" }],
      );

      expect(analysis.isConversation).toBe(true);
      expect(analysis.needsPersistence).toBe(true);
    });

    it("should calculate complexity based on length", () => {
      const short = analyzeTask({ prompt: "Hi" });
      const long = analyzeTask({ prompt: "a".repeat(500) });

      expect(long.complexity).toBeGreaterThan(short.complexity);
    });

    it("should detect multi-step tasks", () => {
      const analysis = analyzeTask({ prompt: "First do this, then do that, finally do this" });

      expect(analysis.complexity).toBeGreaterThan(10); // Multi-step indicators increase complexity
    });
  });

  describe("scoreBackends", () => {
    const baseAnalysis: TaskAnalysis = {
      complexity: 50,
      needsPersistence: false,
      needsTools: false,
      needsFileSearch: false,
      needsCodeInterpreter: false,
      needsVision: false,
      needsComputerUse: false,
      isSimpleQa: true,
      isConversation: false,
      needsRealtimeData: false,
    };

    it("should score simple tasks for Responses", () => {
      const scores = scoreBackends(
        { ...baseAnalysis, complexity: 20, isSimpleQa: true },
        {
          openai_responses: {
            id: "openai_responses",
            name: "OpenAI Responses",
            description: "",
            supportsStreaming: true,
            supportsTools: true,
            supportsVision: true,
            supportsComputerUse: false,
            supportsFileSearch: false,
            supportsCodeInterpreter: false,
            supportsPersistence: false,
            maxContextWindow: 128_000,
            costLevel: "low",
            costTier: "low",
            latencyProfile: "fast",
            reasoningLevel: "medium",
            reliabilityScore: 0.97,
            avgLatencyMs: 1000,
          },
        },
        {},
      );

      expect(scores.length).toBeGreaterThan(0);
      expect(scores[0].score).toBeGreaterThan(0);
    });

    it("should penalize backends without required features", () => {
      const scores = scoreBackends(
        { ...baseAnalysis, needsFileSearch: true },
        {
          openai_responses: {
            id: "openai_responses",
            name: "OpenAI Responses",
            description: "",
            supportsStreaming: true,
            supportsTools: true,
            supportsVision: true,
            supportsComputerUse: false,
            supportsFileSearch: false, // Doesn't support!
            supportsCodeInterpreter: false,
            supportsPersistence: false,
            maxContextWindow: 128_000,
            costLevel: "low",
            costTier: "low",
            latencyProfile: "fast",
            reasoningLevel: "low",
            reliabilityScore: 0.97,
            avgLatencyMs: 1000,
          },
        },
        {},
      );

      expect(scores[0].warnings.length).toBeGreaterThan(0);
      expect(scores[0].warnings[0]).toContain("file search");
    });

    it("should respect cost priority", () => {
      const analysis = baseAnalysis;
      const capabilities = {
        cheap_backend: {
          id: "cheap_backend" as unknown as AgentBackendV2,
          name: "Cheap",
          description: "",
          supportsStreaming: true,
          supportsTools: true,
          supportsVision: false,
          supportsComputerUse: false,
          supportsFileSearch: false,
          supportsCodeInterpreter: false,
          supportsPersistence: false,
          maxContextWindow: 128_000,
          costLevel: "low" as const,
          costTier: "low" as const,
          latencyProfile: "fast" as const,
          reasoningLevel: "low" as const,
          reliabilityScore: 0.9,
          avgLatencyMs: 500,
        },
        expensive_backend: {
          id: "expensive_backend" as unknown as AgentBackendV2,
          name: "Expensive",
          description: "",
          supportsStreaming: true,
          supportsTools: true,
          supportsVision: false,
          supportsComputerUse: false,
          supportsFileSearch: false,
          supportsCodeInterpreter: false,
          supportsPersistence: false,
          maxContextWindow: 128_000,
          costLevel: "high" as const,
          costTier: "high" as const,
          latencyProfile: "medium" as const,
          reasoningLevel: "high" as const,
          reliabilityScore: 0.95,
          avgLatencyMs: 2000,
        },
      };

      const scores = scoreBackends(analysis, capabilities, { priority: "cost" });

      expect(scores[0].backend).toBe("cheap_backend");
      expect(scores[0].reasons.some(r => r.includes("cost"))).toBe(true);
    });

    it("should respect speed priority", () => {
      const analysis = baseAnalysis;
      const capabilities = {
        fast_backend: {
          id: "fast_backend" as unknown as AgentBackendV2,
          name: "Fast",
          description: "",
          supportsStreaming: true,
          supportsTools: true,
          supportsVision: false,
          supportsComputerUse: false,
          supportsFileSearch: false,
          supportsCodeInterpreter: false,
          supportsPersistence: false,
          maxContextWindow: 128_000,
          costLevel: "medium" as const,
          costTier: "medium" as const,
          latencyProfile: "fast" as const,
          reasoningLevel: "medium" as const,
          reliabilityScore: 0.9,
          avgLatencyMs: 500,
        },
        slow_backend: {
          id: "slow_backend" as unknown as AgentBackendV2,
          name: "Slow",
          description: "",
          supportsStreaming: true,
          supportsTools: true,
          supportsVision: false,
          supportsComputerUse: false,
          supportsFileSearch: false,
          supportsCodeInterpreter: false,
          supportsPersistence: false,
          maxContextWindow: 128_000,
          costLevel: "medium" as const,
          costTier: "medium" as const,
          latencyProfile: "slow" as const,
          reasoningLevel: "high" as const,
          reliabilityScore: 0.95,
          avgLatencyMs: 5000,
        },
      };

      const scores = scoreBackends(analysis, capabilities, { priority: "speed" });

      expect(scores[0].backend).toBe("fast_backend");
    });
  });

  describe("selectBackend", () => {
    it("should select Responses for simple questions", () => {
      const result = selectBackend({ prompt: "What is the weather?" });

      expect(result.selectedBackend).toBe("openai_responses");
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.routingDecision).toBe("auto");
    });

    it("should select Assistants for file search", () => {
      const result = selectBackend({ prompt: "Search for my PDF files" });

      expect(result.selectedBackend).toBe("openai_assistants");
    });

    it("should select hybrid for UI tasks (computer_use excluded from auto-select)", () => {
      const result = selectBackend({ prompt: "Click the submit button and fill the form" });

      // openai_computer_use is excluded from automatic selection in scoreBackends,
      // so hybrid (which supports computer_use) is selected instead
      expect(result.selectedBackend).toBe("hybrid");
      expect(result._meta!.analysis.needsComputerUse).toBe(true);
    });

    it("should select Assistants for code tasks", () => {
      const result = selectBackend({ prompt: "Write Python code to sort a list" });

      expect(result.selectedBackend).toBe("openai_assistants");
    });

    it("should respect forceBackend config", () => {
      const result = selectBackend(
        { prompt: "Any question" },
        { forceBackend: "openai_responses" },
      );

      expect(result.selectedBackend).toBe("openai_responses");
      expect(result.routingDecision).toBe("forced");
      expect(result.confidence).toBe(1);
    });

    it("should provide fallback chain", () => {
      const result = selectBackend({ prompt: "Complex task with file search" });

      expect(result.fallbackChain.length).toBeGreaterThan(0);
    });

    it("should include reasoning", () => {
      const result = selectBackend({ prompt: "Simple question" });

      expect(result.reasoning.length).toBeGreaterThan(0);
      expect(result._meta).toBeDefined();
      expect(result._meta!.analysis).toBeDefined();
    });

    it("should throw for invalid forceBackend", () => {
      expect(() =>
        selectBackend({ prompt: "test" }, { forceBackend: "invalid_backend" }),
      ).toThrow();
    });
  });

  describe("planHybridExecution", () => {
    it("should create multi-step plan for complex tasks", () => {
      const plan = planHybridExecution({
        prompt: "Search files and analyze with code",
      });

      expect(plan.steps.length).toBeGreaterThanOrEqual(2);
      expect(plan.totalEstimatedCostUsd).toBeGreaterThan(0);
      expect(plan.totalEstimatedLatencyMs).toBeGreaterThan(0);
    });

    it("should include file search step when needed", () => {
      const plan = planHybridExecution({
        prompt: "Find documents about climate change",
      });

      const hasFileSearchStep = plan.steps.some(s => s.task === "file_search");
      expect(hasFileSearchStep).toBe(true);
    });

    it("should include computer use step when needed", () => {
      const plan = planHybridExecution({
        prompt: "Navigate to settings and click save",
      });

      const hasComputerStep = plan.steps.some(s => s.task === "computer_use");
      expect(hasComputerStep).toBe(true);
    });

    it("should always end with synthesis step", () => {
      const plan = planHybridExecution({ prompt: "Any task" });

      expect(plan.steps[plan.steps.length - 1].task).toBe("synthesis");
    });
  });

  describe("Helper functions", () => {
    it("isBackendAvailable should return boolean", () => {
      expect(isBackendAvailable("openai_responses")).toBe(true);
      expect(isBackendAvailable("nonexistent")).toBe(false);
    });

    it("listAvailableBackends should return all backends", () => {
      const list = listAvailableBackends();

      expect(list.length).toBeGreaterThan(0);
      expect(list[0].id).toBeDefined();
      expect(list[0].name).toBeDefined();
      expect(list[0].capabilities).toBeDefined();
    });

    it("recommendFor should suggest appropriate backend", () => {
      const simple = recommendFor("simple question");
      expect(simple.selectedBackend).toBe("openai_responses");

      const chat = recommendFor("chat");
      expect(chat.selectedBackend).toBe("openai_assistants");

      const file = recommendFor("file search");
      expect(file.selectedBackend).toBe("openai_assistants");

      const ui = recommendFor("ui");
      expect(ui.selectedBackend).toBe("openai_computer_use");
    });
  });

  describe("Integration tests", () => {
    it("testSelector should run all test cases", async () => {
      const result = await testSelector();

      expect(result.ok).toBe(true);
      expect(result.tests.length).toBeGreaterThan(0);
      expect(result.tests.every(t => t.passed)).toBe(true);
    });

    it("testHybridPlanning should create valid plan", async () => {
      const result = await testHybridPlanning();

      expect(result.ok).toBe(true);
      expect(result.plan).toBeDefined();
      expect(result.plan!.steps.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Complex scenarios", () => {
    it("should handle multi-feature requests", () => {
      const result = selectBackend({
        prompt: "Search for sales data, analyze it with Python, then click through the dashboard",
      });

      // Should pick a backend that can handle most features
      expect(result.selectedBackend).toBeDefined();
      expect(result._meta!.analysis.needsFileSearch).toBe(true);
      expect(result._meta!.analysis.needsCodeInterpreter).toBe(true);
      expect(result._meta!.analysis.needsComputerUse).toBe(true);
    });

    it("should handle ambiguous requests", () => {
      const result = selectBackend({ prompt: "Help me with something" });

      // Should still make a decision with lower confidence
      expect(result.selectedBackend).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should respect cost limits", () => {
      const result = selectBackend(
        { prompt: "Complex analysis task" },
        { maxCostUsd: 0.001 },
      );

      // Should warn about cost or pick cheaper backend
      expect(result._meta!.allScores[0].warnings.some(w => w.includes("cost"))).toBe(true);
    });

    it("should respect latency limits", () => {
      const result = selectBackend(
        { prompt: "Quick question" },
        { maxLatencyMs: 500 },
      );

      // Computer Use should be penalized for being slow
      const computerUseScore = result._meta!.allScores.find(
        s => s.backend === "openai_computer_use",
      );
      if (computerUseScore) {
        expect(computerUseScore.warnings.some(w => w.includes("latency"))).toBe(true);
      }
    });
  });
});
