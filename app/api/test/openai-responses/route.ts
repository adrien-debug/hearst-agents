/**
 * Test endpoint pour OpenAI Responses API
 *
 * Routes:
 * - GET /api/test/openai-responses — Health check simple
 * - POST /api/test/openai-responses — Test avec prompt personnalisé
 */

import { NextRequest } from "next/server";
import {
  generateResponse,
  streamResponse,
  quickResponse,
  ResponsesSession,
  testResponsesBackend,
  testResponsesSession,
} from "@/lib/agents/backend-v2/openai-responses";

export const dynamic = "force-dynamic";

// GET — Health check
export async function GET() {
  const result = await testResponsesBackend();
  return Response.json(result);
}

// POST — Test avec streaming ou blocking
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const mode = body.mode ?? "blocking"; // "blocking" | "streaming" | "session"
    const prompt = body.prompt ?? "Say hello";
    const model = body.model ?? "gpt-4o-mini";

    switch (mode) {
      case "blocking": {
        const result = await generateResponse(
          [{ role: "user", content: prompt }],
          { model },
        );

        return Response.json({
          ok: true,
          mode: "blocking",
          prompt,
          response: result.text,
          model: result.model,
          usage: result.usage,
          cost_usd: result.costUsd,
          duration_ms: Date.now() - startTime,
        });
      }

      case "streaming": {
        const events: Array<{
          type: string;
          timestamp: number;
          delta?: string;
          content?: string;
          usage?: { tokensIn?: number; tokensOut?: number; costUsd?: number };
        }> = [];
        let fullText = "";

        for await (const event of streamResponse(
          [{ role: "user", content: prompt }],
          { model },
        )) {
          const eventData = {
            type: event.type,
            timestamp: Date.now(),
            delta: "delta" in event ? event.delta : undefined,
            content: "content" in event ? event.content : undefined,
            usage: "usage" in event ? event.usage : undefined,
          };
          events.push(eventData);

          if (event.type === "message" && event.delta) {
            fullText += event.delta;
          }
        }

        return Response.json({
          ok: true,
          mode: "streaming",
          prompt,
          response: fullText,
          events_count: events.length,
          events,
          duration_ms: Date.now() - startTime,
        });
      }

      case "session": {
        const session = new ResponsesSession(model);
        const conversation: string[] = [];
        let totalCost = 0;

        // Message 1
        const r1 = await session.send(prompt);
        conversation.push(`User: ${prompt}`);
        conversation.push(`Assistant: ${r1.text}`);
        totalCost += r1.costUsd;

        // Message 2 (contextual)
        const followUp = body.follow_up ?? "Can you summarize what I just asked?";
        const r2 = await session.send(followUp);
        conversation.push(`User: ${followUp}`);
        conversation.push(`Assistant: ${r2.text}`);
        totalCost += r2.costUsd;

        return Response.json({
          ok: true,
          mode: "session",
          conversation,
          total_cost_usd: totalCost,
          message_count: session.getHistory().length,
          duration_ms: Date.now() - startTime,
        });
      }

      case "quick": {
        const text = await quickResponse(prompt, model);
        return Response.json({
          ok: true,
          mode: "quick",
          prompt,
          response: text,
          duration_ms: Date.now() - startTime,
        });
      }

      case "session-test": {
        const result = await testResponsesSession();
        const { ok, ...restResult } = result;
        return Response.json({
          ok: result.ok,
          mode: "session-test",
          ...restResult,
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
