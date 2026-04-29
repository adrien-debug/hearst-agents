/**
 * Analytics API — Log product events.
 *
 * POST /api/analytics — Log a structured event.
 *
 * Sécurité : la route exige une session authentifiée et utilise
 * scope.userId (UUID) comme identifiant. Le frontend ne doit PAS envoyer
 * `userId` dans le body — le backend le résout. Si reçu, log un warning
 * pour détecter les call sites pollués.
 */

import { NextResponse } from "next/server";
import { logAnalyticsEvent, type AnalyticsEventType } from "@/lib/analytics/events";
import { requireScope } from "@/lib/platform/auth/scope";

export async function POST(req: Request) {
  const { scope, error: scopeError } = await requireScope({ context: "POST /api/analytics" });
  if (scopeError || !scope) {
    return NextResponse.json({ error: scopeError?.message ?? "not_authenticated" }, { status: scopeError?.status ?? 401 });
  }

  try {
    const body = await req.json();
    const { type, userId: bodyUserId, properties } = body as {
      type: AnalyticsEventType;
      userId?: unknown;
      properties?: Record<string, unknown>;
    };

    if (typeof bodyUserId !== "undefined") {
      console.warn(
        `[Analytics API] body contains userId — ignored. Client should not send this field. ` +
        `Detected userId=${typeof bodyUserId}`,
      );
    }

    if (!type) {
      return NextResponse.json(
        { error: "Missing required field: type" },
        { status: 400 }
      );
    }

    logAnalyticsEvent(type, scope.userId, properties);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Analytics API] POST failed:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json(
      { error: "Failed to log event" },
      { status: 500 }
    );
  }
}
