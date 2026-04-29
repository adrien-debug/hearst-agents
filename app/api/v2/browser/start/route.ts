/**
 * POST /api/v2/browser/start — Crée une session Browserbase live.
 *
 * Signature 3 — Co-Browsing : la BrowserStage appelle cette route pour
 * obtenir un sessionId + connectUrl + debugViewerUrl. Le debugViewerUrl est
 * affiché dans une iframe pour que l'utilisateur voie le browser en direct
 * et reprenne la main via Take Over.
 *
 * Phase B.8 stub : Stagehand n'est pas encore branché, donc le paramètre
 * `task` est seulement loggé pour traçabilité. Phase B.8 complète enqueueera
 * un job `browser-task` ici avec le payload pour piloter la session.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { createSession } from "@/lib/capabilities/providers/browserbase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({ context: "POST /api/v2/browser/start" });
  if (error || !scope) {
    return NextResponse.json({ error: error?.message ?? "not_authenticated" }, { status: error?.status ?? 401 });
  }

  let body: { task?: string; startUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const task = (body.task ?? "").trim();
  if (!task) {
    return NextResponse.json({ error: "task_required" }, { status: 400 });
  }

  try {
    const session = await createSession();
    return NextResponse.json({
      sessionId: session.sessionId,
      connectUrl: session.connectUrl,
      debugViewerUrl: session.debugViewerUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[BrowserStart] createSession failed:", message);
    return NextResponse.json({ error: "session_create_failed", message }, { status: 502 });
  }
}
