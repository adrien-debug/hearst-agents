import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { createMeetingBot } from "@/lib/capabilities/providers/recall-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { scope, error: scopeError } = await requireScope({
    context: "POST /api/v2/meetings/start",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  let body: { meetingUrl?: string; botName?: string };
  try {
    body = (await req.json()) as { meetingUrl?: string; botName?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const meetingUrl = body.meetingUrl?.trim();
  if (!meetingUrl) {
    return NextResponse.json({ error: "meeting_url_required" }, { status: 400 });
  }

  try {
    const { botId, status } = await createMeetingBot({
      meetingUrl,
      botName: body.botName,
    });
    return NextResponse.json({ meetingId: botId, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "meeting_bot_create_failed", message },
      { status: 500 },
    );
  }
}
