/**
 * GET  /api/reports/templates       — liste les templates du tenant (+ publics)
 * POST /api/reports/templates       — sauvegarde un spec comme nouveau template
 *
 * Auth : session NextAuth requise. Scope tenant résolu via requireScope.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { reportSpecSchema } from "@/lib/reports/spec/schema";
import { listTemplates, saveTemplate } from "@/lib/reports/templates/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET ───────────────────────────────────────────────────────

const listQuerySchema = z.object({
  domain: z.string().min(1).optional(),
});

export async function GET(req: NextRequest) {
  const { scope, error } = await requireScope({ context: "reports/templates GET" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const { searchParams } = new URL(req.url);
  const parsed = listQuerySchema.safeParse({
    domain: searchParams.get("domain") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const templates = await listTemplates({
    tenantId: scope.tenantId,
    domain: parsed.data.domain,
  });

  return NextResponse.json({ templates });
}

// ── POST ──────────────────────────────────────────────────────

const bodySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  spec: reportSpecSchema,
  isPublic: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({ context: "reports/templates POST" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const template = await saveTemplate({
    tenantId: scope.tenantId,
    userId: scope.userId,
    name: parsed.data.name,
    description: parsed.data.description,
    spec: parsed.data.spec,
    isPublic: parsed.data.isPublic,
  });

  if (!template) {
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ template }, { status: 201 });
}
