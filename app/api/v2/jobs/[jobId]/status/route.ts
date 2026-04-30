/**
 * GET /api/v2/jobs/[jobId]/status?kind=image-gen
 *
 * Polling-friendly endpoint pour récupérer l'état d'un job BullMQ. Le client
 * envoie le `kind` en query string parce que BullMQ scope les jobs par
 * queue ; sans le kind on devrait scanner toutes les queues.
 *
 * Réponse :
 *   { jobId, kind, state, progress, returnvalue?, failedReason? }
 *
 * states BullMQ : "waiting" | "active" | "completed" | "failed" | "delayed"
 *                | "paused" | "stuck" | "unknown"
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { getJobState } from "@/lib/jobs/queue";
import type { JobKind } from "@/lib/jobs/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KNOWN_KINDS = [
  "image-gen",
  "audio-gen",
  "video-gen",
  "document-parse",
  "code-exec",
  "browser-task",
  "meeting-bot",
  "memory-ingest",
  "asset-variant",
] as const satisfies readonly JobKind[];

const querySchema = z.object({
  kind: z.enum(KNOWN_KINDS),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  const { scope, error: scopeError } = await requireScope({
    context: `GET /api/v2/jobs/${jobId}/status`,
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ kind: url.searchParams.get("kind") });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: "Query param `kind` requis (image-gen, audio-gen, …).",
      },
      { status: 400 },
    );
  }

  const state = await getJobState(parsed.data.kind, jobId);
  if (!state) {
    return NextResponse.json(
      { error: "job_not_found", jobId, kind: parsed.data.kind },
      { status: 404 },
    );
  }

  return NextResponse.json({
    jobId,
    kind: parsed.data.kind,
    state: state.state,
    progress: state.progress,
    returnvalue: state.returnvalue ?? null,
    failedReason: state.failedReason ?? null,
  });
}
