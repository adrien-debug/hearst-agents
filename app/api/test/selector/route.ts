/**
 * Test endpoint pour le Backend Selector
 *
 * Routes:
 * - GET /api/test/selector — Liste les backends disponibles
 * - POST /api/test/selector — Teste la sélection pour un prompt
 */

import { NextRequest } from "next/server";
import {
  selectBackend,
  planHybridExecution,
  recommendFor,
  listAvailableBackends,
  testSelector,
  testHybridPlanning,
  type SelectorConfig,
} from "@/lib/agents/backend-v2/selector";

export const dynamic = "force-dynamic";

// GET — Liste des backends
export async function GET() {
  const startTime = Date.now();

  try {
    const backends = listAvailableBackends();

    return Response.json({
      ok: true,
      backends: backends.map(b => ({
        id: b.id,
        name: b.name,
        available: b.available,
        supports: {
          streaming: b.capabilities.supportsStreaming,
          tools: b.capabilities.supportsTools,
          vision: b.capabilities.supportsVision,
          computerUse: b.capabilities.supportsComputerUse,
          fileSearch: b.capabilities.supportsFileSearch,
          codeInterpreter: b.capabilities.supportsCodeInterpreter,
          persistence: b.capabilities.supportsPersistence,
        },
        costLevel: b.capabilities.costLevel,
        latencyProfile: b.capabilities.latencyProfile,
        reasoningLevel: b.capabilities.reasoningLevel,
      })),
      count: backends.length,
      duration_ms: Date.now() - startTime,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
        duration_ms: Date.now() - startTime,
      },
      { status: 500 },
    );
  }
}

// POST — Test de sélection
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const mode = body.mode ?? "select"; // "select" | "hybrid" | "recommend" | "test"

    switch (mode) {
      case "select": {
        const result = selectBackend(
          {
            prompt: body.prompt ?? "Hello",
            context: body.context,
            complexity: body.complexity,
            needsVision: body.needsVision,
            needsBrowsing: body.needsBrowsing,
            needsCodeExecution: body.needsCodeExecution,
            needsFileSearch: body.needsFileSearch,
            needsComputerUse: body.needsComputerUse,
            userTier: body.userTier ?? "pro",
          },
          {
            priority: body.priority ?? "balanced",
            maxCostUsd: body.maxCostUsd,
            maxLatencyMs: body.maxLatencyMs,
            forceBackend: body.forceBackend,
          },
          body.history,
        );

        return Response.json({
          ok: true,
          mode: "select",
          result: {
            selectedBackend: result.selectedBackend,
            confidence: result.confidence,
            routingDecision: result.routingDecision,
            estimatedCostUsd: result.estimatedCostUsd,
            estimatedLatencyMs: result.estimatedLatencyMs,
            fallbackChain: result.fallbackChain,
            reasoning: result.reasoning,
          },
          meta: result._meta
            ? {
                analysis: result._meta.analysis,
                allScores: result._meta.allScores.map(s => ({
                  backend: s.backend,
                  score: s.score,
                  confidence: s.confidence,
                  estimatedCostUsd: s.estimatedCostUsd,
                  estimatedLatencyMs: s.estimatedLatencyMs,
                })),
                decisionTimeMs: result._meta.decisionTimeMs,
              }
            : undefined,
          duration_ms: Date.now() - startTime,
        });
      }

      case "hybrid": {
        const plan = planHybridExecution(
          {
            prompt: body.prompt ?? "Complex multi-step task",
          },
          {
            priority: body.priority ?? "balanced",
          },
        );

        return Response.json({
          ok: true,
          mode: "hybrid",
          plan: {
            steps: plan.steps.map((step, i) => ({
              step: i + 1,
              backend: step.backend,
              task: step.task,
              input: step.input,
              dependsOn: step.dependsOn,
            })),
            totalEstimatedCostUsd: plan.totalEstimatedCostUsd,
            totalEstimatedLatencyMs: plan.totalEstimatedLatencyMs,
            fallbackStrategy: plan.fallbackStrategy,
          },
          duration_ms: Date.now() - startTime,
        });
      }

      case "recommend": {
        const useCase = body.useCase ?? "simple question";
        const recommendation = recommendFor(useCase);

        return Response.json({
          ok: true,
          mode: "recommend",
          useCase,
          recommendation: {
            backend: recommendation.selectedBackend,
            confidence: recommendation.confidence,
            reasoning: recommendation.reasoning,
          },
          duration_ms: Date.now() - startTime,
        });
      }

      case "test": {
        const selectorTest = await testSelector();
        const hybridTest = await testHybridPlanning();

        return Response.json({
          ok: selectorTest.ok && hybridTest.ok,
          mode: "test",
          selector: {
            passed: selectorTest.ok,
            tests: selectorTest.tests,
          },
          hybrid: {
            passed: hybridTest.ok,
            plan: hybridTest.plan,
            error: hybridTest.error,
          },
          duration_ms: Date.now() - startTime,
        });
      }

      case "compare": {
        // Compare plusieurs backends pour le même prompt
        const prompt = body.prompt ?? "Example task";
        const priorities: Array<SelectorConfig["priority"]> = [
          "cost",
          "speed",
          "quality",
          "balanced",
        ];

        const comparisons = priorities.map(priority => {
          const result = selectBackend(
            { prompt, userTier: "pro" },
            { priority },
          );
          return {
            priority,
            selectedBackend: result.selectedBackend,
            confidence: result.confidence,
            estimatedCostUsd: result.estimatedCostUsd,
            estimatedLatencyMs: result.estimatedLatencyMs,
          };
        });

        return Response.json({
          ok: true,
          mode: "compare",
          prompt,
          comparisons,
          duration_ms: Date.now() - startTime,
        });
      }

      default:
        return Response.json(
          {
            ok: false,
            error: `Invalid mode: ${mode}. Use: select, hybrid, recommend, test, compare`,
          },
          { status: 400 },
        );
    }
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        duration_ms: Date.now() - startTime,
      },
      { status: 500 },
    );
  }
}
