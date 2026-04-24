/**
 * Test endpoint pour OpenAI Computer Use API
 *
 * Routes:
 * - GET /api/test/openai-computer-use — Health check + access verification
 * - POST /api/test/openai-computer-use — Test avec task personnalisée
 *
 * ⚠️ Nécessite accès beta Computer Use d'OpenAI
 */

import { NextRequest } from "next/server";
import {
  createComputerSession,
  encodeImageToBase64,
  executeComputerStep,
  runComputerTask,
  createMockScreenshot,
  testComputerUseBackend,
  testComputerUseWithMock,
  type ComputerAction,
  type ComputerUseConfig,
} from "@/lib/agents/backend-v2/openai-computer-use";

export const dynamic = "force-dynamic";

type ComputerEnvironment = NonNullable<ComputerUseConfig["environment"]>;

function parseEnvironment(value: unknown): ComputerEnvironment {
  return value === "browser" || value === "mac" || value === "windows" || value === "ubuntu"
    ? value
    : "browser";
}

// GET — Health check + access verification
export async function GET() {
  const result = await testComputerUseBackend();
  return Response.json(result);
}

// POST — Test avec task personnalisée
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const mode = typeof body.mode === "string" ? body.mode : "access-check";

    switch (mode) {
      case "access-check": {
        const result = await testComputerUseBackend();
        return Response.json({
          ...result,
          mode: "access-check",
          duration_ms: Date.now() - startTime,
        });
      }

      case "single-step": {
        const instruction =
          typeof body.instruction === "string" ? body.instruction : "Click on the blue button";
        const environment = parseEnvironment(body.environment);

        const session = createComputerSession();
        const screenshot = createMockScreenshot();

        const result = await executeComputerStep(
          session,
          encodeImageToBase64(screenshot),
          instruction,
          { environment },
        );

        return Response.json({
          ok: true,
          mode: "single-step",
          instruction,
          reasoning: result.reasoning,
          action: result.action,
          done: result.done,
          usage: result.usage,
          session_screenshots: session.screenshots.length,
          session_actions: session.actions.length,
          duration_ms: Date.now() - startTime,
        });
      }

      case "full-task": {
        const instruction =
          typeof body.instruction === "string" ? body.instruction : "Navigate to settings page";
        const environment = parseEnvironment(body.environment);
        const maxSteps = typeof body.max_steps === "number" ? body.max_steps : 5;

        const events: Array<{
          type: string;
          timestamp: number;
          content?: string;
          action?: ComputerAction;
          status?: string;
        }> = [];
        const actions: string[] = [];
        let totalCost = 0;

        const getScreenshot = () => createMockScreenshot();

        for await (const event of runComputerTask(
          instruction,
          getScreenshot,
          { environment },
          maxSteps,
        )) {
          const eventData = {
            type: event.type,
            timestamp: Date.now(),
            content: "content" in event ? event.content : undefined,
            status: "status" in event ? event.status : undefined,
          };
          events.push(eventData);

          // Extract action from tool_call content
          if (event.type === "tool_call" && event.content) {
            try {
              const action = JSON.parse(event.content);
              if (action.type) {
                actions.push(action.type);
              }
            } catch {
              // Not valid JSON
            }
          }

          if ("usage" in event && event.usage?.costUsd) {
            totalCost = event.usage.costUsd;
          }

          if (event.type === "idle") {
            break;
          }
        }

        return Response.json({
          ok: true,
          mode: "full-task",
          instruction,
          environment,
          max_steps: maxSteps,
          events_count: events.length,
          actions,
          total_cost_usd: totalCost,
          events,
          duration_ms: Date.now() - startTime,
        });
      }

      case "mock-test": {
        const result = await testComputerUseWithMock();
        return Response.json({
          ...result,
          mode: "mock-test",
          duration_ms: Date.now() - startTime,
        });
      }

      default:
        return Response.json(
          { ok: false, error: `Invalid mode: ${mode}` },
          { status: 400 },
        );
    }
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
