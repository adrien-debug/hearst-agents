/**
 * Test endpoint for Orchestrator V2
 *
 * Routes:
 * - GET /api/test/orchestrate-v2 — Status check
 * - POST /api/test/orchestrate-v2 — Test orchestration
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  orchestrateV2,
  orchestrateV2Blocking,
  isV2Enabled,
  shouldUseV2,
} from "@/lib/orchestrator/orchestrate-v2";
import { SessionManager } from "@/lib/agents/sessions";

export const dynamic = "force-dynamic";

// Create Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dummy-key";
const supabase = createClient(supabaseUrl, supabaseKey);

// GET — Status check
export async function GET() {
  const startTime = Date.now();

  const manager = SessionManager.getInstance();
  const sessions = manager.list();

  return Response.json({
    ok: true,
    v2Enabled: isV2Enabled(),
    rolloutPercentage: 100,
    activeSessions: sessions.length,
    sessions: sessions.map(s => ({
      id: s.id,
      backend: s.backend,
      status: s.status,
      metrics: s.getMetrics(),
    })),
    duration_ms: Date.now() - startTime,
  });
}

// POST — Test orchestration
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const mode = body.mode ?? "blocking"; // "blocking" | "streaming"

    const input = {
      userId: body.userId ?? "test-user",
      message: body.message ?? "Hello",
      conversationId: body.conversationId,
      threadId: body.threadId,
      surface: body.surface ?? "home",
      conversationHistory: body.conversationHistory,
      forceBackend: body.forceBackend,
      streaming: mode === "streaming",
      tenantId: body.tenantId ?? "dev-tenant",
      workspaceId: body.workspaceId ?? "dev-workspace",
    };

    // Check if user should use V2
    const useV2 = shouldUseV2(input.userId);

    switch (mode) {
      case "blocking": {
        const result = await orchestrateV2Blocking(supabase, input);

        return Response.json({
          ok: result.success,
          mode: "blocking",
          v2Enabled: useV2,
          result: {
            sessionId: result.sessionId,
            backend: result.backend,
            response: result.response,
            error: result.error,
            metrics: result.metrics,
          },
          duration_ms: Date.now() - startTime,
        });
      }

      case "streaming": {
        const stream = orchestrateV2(supabase, input);

        // Collect all events for the response (not true streaming for test)
        const events: Array<{
          type: string;
          timestamp: number;
          delta?: string;
          message?: string;
          error?: string;
          metrics?: unknown;
        }> = [];

        const reader = stream.getReader();
        let fullResponse = "";

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
                events.push({
                  ...data,
                  timestamp: Date.now(),
                });

                if (data.type === "text_delta" && data.delta) {
                  fullResponse += data.delta;
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }

        return Response.json({
          ok: true,
          mode: "streaming",
          v2Enabled: useV2,
          events_count: events.length,
          events: events.slice(0, 100), // Limit for response size
          fullResponse,
          duration_ms: Date.now() - startTime,
        });
      }

      case "compare": {
        // Test both V1 and V2 for comparison
        const v2Start = Date.now();
        const v2Result = await orchestrateV2Blocking(supabase, input);
        const v2Duration = Date.now() - v2Start;

        return Response.json({
          ok: true,
          mode: "compare",
          v2: {
            success: v2Result.success,
            backend: v2Result.backend,
            response: v2Result.response?.substring(0, 200),
            error: v2Result.error,
            metrics: v2Result.metrics,
            duration_ms: v2Duration,
          },
          comparison: {
            v2Selected: v2Result.success,
            v2Backend: v2Result.backend,
          },
          duration_ms: Date.now() - startTime,
        });
      }

      default:
        return Response.json(
          { ok: false, error: `Invalid mode: ${mode}. Use: blocking, streaming, compare` },
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
