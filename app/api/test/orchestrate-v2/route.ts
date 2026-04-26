/**
 * Test endpoint for Unified Orchestrator
 *
 * Routes:
 * - GET /api/test/orchestrate-v2 — Status check
 * - POST /api/test/orchestrate-v2 — Test orchestration
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { orchestrateV2 } from "@/lib/engine/orchestrator/entry";
import { SessionManager } from "@/lib/agents/sessions";

export const dynamic = "force-dynamic";

// Create Supabase client — fail loudly if service-role key is missing.
// A silent fallback would let the orchestrator run with degraded permissions
// and obscure the misconfiguration in production logs.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for /api/test/orchestrate-v2");
}
const supabase = createClient(supabaseUrl, supabaseKey);

// GET — Status check
export async function GET() {
  const startTime = Date.now();

  const manager = SessionManager.getInstance();
  const sessions = manager.list();

  return Response.json({
    ok: true,
    version: "unified",
    note: "Orchestrator V2 has been unified with V1",
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
    const { userId, message, conversationId, surface, tenantId, workspaceId } = body;

    if (!userId || !message) {
      return Response.json(
        { error: "Missing required fields: userId, message" },
        { status: 400 }
      );
    }

    // Use unified orchestrator
    const stream = orchestrateV2(supabase, {
      userId,
      message,
      conversationId,
      surface,
      tenantId,
      workspaceId,
    });

    // Collect stream for response
    const reader = stream.getReader();
    const chunks: string[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    return Response.json({
      ok: true,
      version: "unified",
      chunks: chunks.length,
      preview: chunks.slice(0, 5),
      duration_ms: Date.now() - startTime,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
