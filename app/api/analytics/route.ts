/**
 * Analytics API — Log product events
 *
 * POST /api/analytics — Log a structured event
 */

import { NextResponse } from "next/server";
import { logAnalyticsEvent, type AnalyticsEventType } from "@/lib/analytics/events";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, userId, properties } = body as {
      type: AnalyticsEventType;
      userId: string;
      properties?: Record<string, unknown>;
    };

    if (!type || !userId) {
      return NextResponse.json(
        { error: "Missing required fields: type, userId" },
        { status: 400 }
      );
    }

    // Log the event (server-side)
    logAnalyticsEvent(type, userId, properties);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Analytics API] POST failed:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json(
      { error: "Failed to log event" },
      { status: 500 }
    );
  }
}
