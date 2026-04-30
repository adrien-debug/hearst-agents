/**
 * POST /api/v2/memory/pin
 *
 * Body : { messageId: string, text: string, priority?: "high" | "normal" }
 *
 * Force l'ingestion immédiate d'un message dans la mémoire LTM avec
 * `metadata.pinned = true`. Utilisé par le badge "Remember" inline.
 *
 * Renvoie 503 si OPENAI_API_KEY absent.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { isEmbeddingsAvailable } from "@/lib/embeddings/embed";
import { upsertEmbedding } from "@/lib/embeddings/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PinBody {
  messageId?: string;
  text?: string;
  priority?: string;
}

export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({
    context: "POST /api/v2/memory/pin",
  });
  if (error || !scope) {
    return NextResponse.json(
      { error: error?.message ?? "not_authenticated" },
      { status: error?.status ?? 401 },
    );
  }

  if (!isEmbeddingsAvailable()) {
    return NextResponse.json(
      { error: "embeddings_unavailable" },
      { status: 503 },
    );
  }

  let body: PinBody;
  try {
    body = (await req.json()) as PinBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const messageId = (body.messageId ?? "").trim();
  const text = (body.text ?? "").trim();
  if (!messageId || !text) {
    return NextResponse.json(
      { error: "missing_fields", message: "messageId et text requis." },
      { status: 400 },
    );
  }

  const priority = body.priority === "high" ? "high" : "normal";

  const ok = await upsertEmbedding({
    userId: scope.userId,
    tenantId: scope.tenantId,
    sourceKind: "message",
    sourceId: messageId,
    textExcerpt: text,
    metadata: {
      pinned: true,
      priority,
      pinnedAt: new Date().toISOString(),
    },
  });

  if (!ok) {
    return NextResponse.json(
      { error: "upsert_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, pinned: true });
}
