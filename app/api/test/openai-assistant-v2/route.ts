/**
 * Test endpoint pour OpenAI Assistants V2 — Tool Calls + Streaming
 *
 * POST /api/test/openai-assistant-v2
 * Body: { "prompt": "What time is it?" }
 */

import { NextRequest } from "next/server";
import {
  createAssistantSession,
  runAssistantSession,
  testAssistantWithTools,
} from "@/lib/agents/backend-v2/openai-assistant-v2";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET - Quick test
export async function GET() {
  console.log("[API] Testing assistant with tools...");
  const result = await testAssistantWithTools();
  return Response.json(result);
}

// POST - Custom prompt with streaming simulation
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const prompt = body.prompt ?? "What is 2+2?";

    console.log(`[API] Creating assistant session for: ${prompt}`);

    // Créer une session
    const session = await createAssistantSession(
      body.model ?? "gpt-4o-mini",
      "Test Assistant V2",
      "You are a helpful assistant with access to tools (time, calculator, text formatting, web search). Use them when appropriate.",
    );

    console.log(`[API] Session created: assistant=${session.assistantId}, thread=${session.threadId}`);

    // Collecter tous les events
    const events: Array<{
      type: string;
      timestamp: number;
      content?: string;
      delta?: string;
      tool?: string;
      status?: string;
      error?: string;
      usage?: { tokensIn?: number; tokensOut?: number; costUsd?: number };
    }> = [];

    let fullResponse = "";
    const toolCalls: string[] = [];

    for await (const event of runAssistantSession(session, prompt, { timeoutMs: 30_000 })) {
      const eventData = {
        type: event.type,
        timestamp: Date.now(),
        content: "content" in event ? event.content : undefined,
        delta: "delta" in event ? event.delta : undefined,
        tool: "tool" in event ? event.tool : undefined,
        status: "status" in event ? event.status : undefined,
        error: "error" in event ? event.error : undefined,
        usage: "usage" in event ? event.usage : undefined,
      };

      events.push(eventData);

      if (event.type === "tool_call" && "tool" in event && event.tool) {
        toolCalls.push(event.tool);
      }

      if (event.type === "message" && event.content) {
        fullResponse = event.content;
      }
    }

    const duration = Date.now() - startTime;

    return Response.json({
      ok: true,
      prompt,
      response: fullResponse,
      tool_calls: toolCalls,
      events_count: events.length,
      events,
      duration_ms: duration,
      session: {
        assistant_id: session.assistantId,
        thread_id: session.threadId,
      },
    });

  } catch (error) {
    console.error("[API] Error:", error);
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
      duration_ms: Date.now() - startTime,
    }, { status: 500 });
  }
}
