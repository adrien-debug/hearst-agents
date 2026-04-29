/**
 * GET /api/v2/browser/[id] — Statut d'une session Browserbase + debug viewer.
 * DELETE /api/v2/browser/[id] — Stoppe une session Browserbase.
 *
 * Signature 3 — Co-Browsing : la BrowserStage poll cette route pour suivre
 * l'état de la session ou la fermer côté UI ("Stop" → DELETE → vidange du
 * stage).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getSession, stopSession } from "@/lib/capabilities/providers/browserbase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const { scope, error } = await requireScope({ context: "GET /api/v2/browser/[id]" });
  if (error || !scope) {
    return NextResponse.json({ error: error?.message ?? "not_authenticated" }, { status: error?.status ?? 401 });
  }

  if (!id?.trim()) {
    return NextResponse.json({ error: "session_id_required" }, { status: 400 });
  }

  try {
    const session = await getSession(id);
    return NextResponse.json({
      status: session.status,
      createdAt: session.createdAt,
      stoppedAt: session.stoppedAt,
      debugViewerUrl: session.debugViewerUrl,
      connectUrl: session.connectUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[BrowserSession] getSession failed:", message);
    return NextResponse.json({ error: "session_fetch_failed", message }, { status: 502 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const { scope, error } = await requireScope({ context: "DELETE /api/v2/browser/[id]" });
  if (error || !scope) {
    return NextResponse.json({ error: error?.message ?? "not_authenticated" }, { status: error?.status ?? 401 });
  }

  if (!id?.trim()) {
    return NextResponse.json({ error: "session_id_required" }, { status: 400 });
  }

  try {
    await stopSession(id);
    return NextResponse.json({ stopped: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[BrowserSession] stopSession failed:", message);
    return NextResponse.json({ error: "session_stop_failed", message }, { status: 502 });
  }
}
