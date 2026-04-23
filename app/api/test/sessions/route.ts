/**
 * Test endpoint pour le Session Manager
 *
 * Routes:
 * - GET /api/test/sessions — Liste les sessions actives
 * - POST /api/test/sessions — Crée et teste une session
 */

import { NextRequest } from "next/server";
import {
  SessionManager,
  createSession,
  closeAllSessions,
  OpenAIResponsesSession,
  OpenAIAssistantSession,
  OpenAIComputerSession,
} from "@/lib/agents/sessions";

export const dynamic = "force-dynamic";

// GET — Liste les sessions
export async function GET() {
  const startTime = Date.now();
  const manager = SessionManager.getInstance();

  const sessions = manager.list().map(s => ({
    id: s.id,
    backend: s.backend,
    status: s.status,
    messageCount: s.getMetrics().messageCount,
    tokenCount: s.getTokenCount(),
  }));

  return Response.json({
    ok: true,
    sessions,
    count: sessions.length,
    duration_ms: Date.now() - startTime,
  });
}

// POST — Test de session
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const mode = body.mode ?? "create"; // "create" | "send" | "handoff" | "close-all"

    switch (mode) {
      case "create": {
        const backend = body.backend; // undefined = auto-select
        const session = backend
          ? await SessionManager.getInstance().createWithBackend(backend, {
              systemPrompt: body.systemPrompt,
              model: body.model,
              userId: body.userId,
            })
          : await createSession(body.prompt ?? "Hello", {
              systemPrompt: body.systemPrompt,
              model: body.model,
              userId: body.userId,
            });

        return Response.json({
          ok: true,
          mode: "create",
          session: {
            id: session.id,
            backend: session.backend,
            status: session.status,
            config: {
              model: session.config.model,
              systemPrompt: session.config.systemPrompt,
            },
          },
          duration_ms: Date.now() - startTime,
        });
      }

      case "send": {
        const sessionId = body.sessionId;
        const message = body.message ?? "Hello";

        const manager = SessionManager.getInstance();
        const session = manager.get(sessionId);

        if (!session) {
          return Response.json(
            { ok: false, error: `Session not found: ${sessionId}` },
            { status: 404 },
          );
        }

        const response = await session.send(message);

        return Response.json({
          ok: true,
          mode: "send",
          sessionId,
          response: {
            message: {
              id: response.message.id,
              role: response.message.role,
              content: response.message.content.substring(0, 500), // Truncate
            },
            usage: response.usage,
          },
          metrics: session.getMetrics(),
          duration_ms: Date.now() - startTime,
        });
      }

      case "send-stream": {
        const sessionId = body.sessionId;
        const message = body.message ?? "Hello";

        const manager = SessionManager.getInstance();
        const session = manager.get(sessionId);

        if (!session) {
          return Response.json(
            { ok: false, error: `Session not found: ${sessionId}` },
            { status: 404 },
          );
        }

        const events: Array<{
          type: string;
          timestamp: number;
          delta?: string;
          content?: string;
          status?: string;
        }> = [];

        for await (const event of session.sendStream(message)) {
          events.push({
            type: event.type,
            timestamp: Date.now(),
            delta: "delta" in event ? event.delta : undefined,
            content: "content" in event ? event.content : undefined,
            status: "status" in event ? event.status : undefined,
          });
        }

        return Response.json({
          ok: true,
          mode: "send-stream",
          sessionId,
          events_count: events.length,
          events,
          duration_ms: Date.now() - startTime,
        });
      }

      case "handoff": {
        const fromSessionId = body.fromSessionId;
        const toBackend = body.toBackend;

        const manager = SessionManager.getInstance();
        const result = await manager.handoff(fromSessionId, toBackend);

        return Response.json({
          ok: result.success,
          mode: "handoff",
          fromSessionId,
          toBackend,
          newSessionId: result.toSession.id,
          transferredMessages: result.transferredMessages,
          error: result.error,
          duration_ms: Date.now() - startTime,
        });
      }

      case "close": {
        const sessionId = body.sessionId;
        const manager = SessionManager.getInstance();
        const closed = await manager.close(sessionId);

        return Response.json({
          ok: closed,
          mode: "close",
          sessionId,
          duration_ms: Date.now() - startTime,
        });
      }

      case "close-all": {
        await closeAllSessions();

        return Response.json({
          ok: true,
          mode: "close-all",
          duration_ms: Date.now() - startTime,
        });
      }

      case "metrics": {
        const manager = SessionManager.getInstance();
        const metrics = manager.getMetrics();

        return Response.json({
          ok: true,
          mode: "metrics",
          sessions: metrics,
          duration_ms: Date.now() - startTime,
        });
      }

      case "health": {
        const manager = SessionManager.getInstance();
        const health = await manager.healthCheck();

        return Response.json({
          ok: true,
          mode: "health",
          sessions: health,
          allHealthy: health.every(h => h.healthy),
          duration_ms: Date.now() - startTime,
        });
      }

      case "list": {
        const manager = SessionManager.getInstance();
        const sessions = manager.list().map(s => ({
          id: s.id,
          backend: s.backend,
          status: s.status,
          messageCount: s.getMetrics().messageCount,
          tokenCount: s.getTokenCount(),
        }));

        return Response.json({
          ok: true,
          mode: "list",
          sessions,
          count: sessions.length,
          duration_ms: Date.now() - startTime,
        });
      }

      default:
        return Response.json(
          {
            ok: false,
            error: `Invalid mode: ${mode}. Use: create, send, send-stream, handoff, close, close-all, metrics, health, list`,
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
