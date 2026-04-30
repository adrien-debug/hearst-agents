/**
 * POST /api/v2/inbox/schedule
 *
 * Crée un événement Calendar via le tool natif Google (createCalendarEvent).
 * Body : { summary, start (ISO), end (ISO), description?, attendees? }
 *
 * Sans token Google → 503. Pas d'écriture Composio ici (on a déjà le scope
 * Google Calendar via NextAuth).
 *
 * Return : { ok, eventId, htmlLink }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { createCalendarEvent } from "@/lib/connectors/google/calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  summary: z.string().min(1).max(200),
  start: z.string().min(1),
  end: z.string().min(1),
  description: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  location: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({ context: "POST /api/v2/inbox/schedule" });
  if (error || !scope) {
    return NextResponse.json(
      { error: error?.message ?? "not_authenticated" },
      { status: error?.status ?? 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.format() },
      { status: 400 },
    );
  }

  try {
    const ev = await createCalendarEvent(scope.userId, {
      summary: parsed.data.summary,
      start: parsed.data.start,
      end: parsed.data.end,
      description: parsed.data.description,
      location: parsed.data.location,
      attendees: parsed.data.attendees,
    });

    return NextResponse.json({
      ok: true,
      eventId: ev.id,
      htmlLink: ev.htmlLink,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/v2/inbox/schedule] failed:", message);
    if (/no.*token|not.*authoriz|403|401/i.test(message)) {
      return NextResponse.json(
        { ok: false, error: "google_not_connected", message },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: "schedule_failed", message }, { status: 500 });
  }
}
