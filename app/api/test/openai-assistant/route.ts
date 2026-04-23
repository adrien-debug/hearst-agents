/**
 * Test endpoint pour OpenAI Assistants Backend
 *
 * GET /api/test/openai-assistant - Health check simple
 * POST /api/test/openai-assistant - Test complet avec prompt personnalisé
 */

import { NextRequest } from "next/server";
import { testAssistantBackend, runOpenAIAssistantSession } from "@/lib/agents/backend-v2/openai-assistant";
import type { ManagedSessionConfig } from "@/lib/agents/backend-v2/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET - Health check rapide
export async function GET() {
  const startTime = Date.now();

  try {
    const result = await testAssistantBackend();
    const duration = Date.now() - startTime;

    if (!result.ok) {
      return Response.json({
        ok: false,
        error: result.error,
        duration_ms: duration,
      }, { status: 500 });
    }

    return Response.json({
      ok: true,
      assistant_id: result.assistantId,
      thread_id: result.threadId,
      duration_ms: duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("[Test API] Error:", error);
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      duration_ms: duration,
    }, { status: 500 });
  }
}

// POST - Test avec prompt personnalisé
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const prompt = body.prompt ?? "Say hello and confirm OpenAI Assistants is working";
    const model = body.model ?? "gpt-4o-mini";

    const config: ManagedSessionConfig = {
      backend: "openai_assistants",
      prompt,
      runId: `test-${Date.now()}`,
      tenantId: "test",
      workspaceId: "test",
    };

    const assistantConfig = {
      model,
      name: "Test Assistant",
    };

    const events: Array<{
      type: string;
      content?: string;
      delta?: string;
      status?: string;
      error?: string;
      usage?: { tokensIn?: number; tokensOut?: number; costUsd?: number };
    }> = [];

    for await (const event of runOpenAIAssistantSession(config, assistantConfig)) {
      events.push({
        type: event.type,
        content: event.content,
        delta: event.delta,
        status: event.status,
        error: event.error,
        usage: event.usage,
      });
    }

    const duration = Date.now() - startTime;
    const finalEvent = events.find(e => e.type === "idle");
    const errorEvent = events.find(e => e.type === "error");

    if (errorEvent) {
      return Response.json({
        ok: false,
        error: errorEvent.error,
        events,
        duration_ms: duration,
      }, { status: 500 });
    }

    return Response.json({
      ok: true,
      response: finalEvent?.content ?? "",
      events,
      duration_ms: duration,
      model,
    });

  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
