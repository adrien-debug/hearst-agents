/**
 * GET  /api/v2/marketplace/templates  — liste paginée des templates publics
 * POST /api/v2/marketplace/templates  — publie un nouveau template
 *
 * Filtres query params (GET) :
 *   kind={workflow|report_spec|persona}
 *   tags=tag1,tag2 (intersection)
 *   featured=1
 *   q=search (title + description ilike)
 *   limit=30 offset=0
 *
 * Body POST :
 *   { kind, title, description?, payload, tags?, anonymizeAuthor? }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { listTemplates, publishTemplate } from "@/lib/marketplace/store";
import { checkRateLimit } from "@/lib/marketplace/rate-limit";
import { MARKETPLACE_KINDS, tagsSchema } from "@/lib/marketplace/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { scope, error } = await requireScope({
    context: "GET /api/v2/marketplace/templates",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const { searchParams } = new URL(req.url);
  const kindParam = searchParams.get("kind");
  const kind =
    kindParam && (MARKETPLACE_KINDS as readonly string[]).includes(kindParam)
      ? (kindParam as (typeof MARKETPLACE_KINDS)[number])
      : undefined;
  const tagsParam = searchParams.get("tags");
  const tags = tagsParam
    ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 5)
    : undefined;
  const featured = searchParams.get("featured") === "1";
  const q = searchParams.get("q") ?? undefined;
  const limit = Number.parseInt(searchParams.get("limit") ?? "30", 10) || 30;
  const offset = Number.parseInt(searchParams.get("offset") ?? "0", 10) || 0;

  const templates = await listTemplates({
    kind,
    tags,
    featured,
    q,
    limit,
    offset,
  });

  return NextResponse.json({
    templates,
    scope: { isDevFallback: scope.isDevFallback },
  });
}

// ── POST ────────────────────────────────────────────────────

const publishSchema = z.object({
  kind: z.enum(MARKETPLACE_KINDS),
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  payload: z.unknown(),
  tags: tagsSchema.optional(),
  anonymizeAuthor: z.boolean().optional(),
  authorDisplayName: z.string().max(80).optional(),
});

export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({
    context: "POST /api/v2/marketplace/templates",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (!checkRateLimit(scope.userId, "publish")) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const display = parsed.data.anonymizeAuthor
    ? null
    : parsed.data.authorDisplayName?.trim() || null;

  const template = await publishTemplate({
    kind: parsed.data.kind,
    title: parsed.data.title,
    description: parsed.data.description,
    payload: parsed.data.payload,
    tags: parsed.data.tags,
    authorUserId: scope.userId,
    authorTenantId: scope.tenantId,
    authorDisplayName: display ?? undefined,
  });

  if (!template) {
    return NextResponse.json({ error: "publish_failed" }, { status: 500 });
  }

  return NextResponse.json({ template }, { status: 201 });
}
