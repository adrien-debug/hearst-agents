/**
 * POST /api/v2/voice/transcripts/append
 *
 * Append une entry user/assistant au transcript persisté. Les tool_call /
 * tool_result sont persistés directement par /api/v2/voice/tool-call —
 * cette route sert uniquement aux entries de dialogue.
 *
 * Body : {
 *   sessionId: string,
 *   threadId?: string,
 *   entry: { id, role: "user"|"assistant", text, timestamp }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import {
  appendTranscriptEntry,
  type VoiceTranscriptEntry,
} from "@/lib/voice/transcript-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { scope, error: scopeError } = await requireScope({
    context: "POST /api/v2/voice/transcripts/append",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  let body: { sessionId?: unknown; threadId?: unknown; entry?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const threadId = typeof body.threadId === "string" ? body.threadId : undefined;
  if (!sessionId) {
    return NextResponse.json({ error: "missing_sessionId" }, { status: 400 });
  }

  const entry = body.entry as VoiceTranscriptEntry | undefined;
  if (
    !entry ||
    typeof entry.id !== "string" ||
    typeof entry.text !== "string" ||
    typeof entry.role !== "string"
  ) {
    return NextResponse.json({ error: "invalid_entry" }, { status: 400 });
  }

  const ok = await appendTranscriptEntry({
    sessionId,
    userId: scope.userId,
    tenantId: scope.tenantId,
    threadId: threadId ?? null,
    entry,
  });

  return NextResponse.json({ ok });
}
