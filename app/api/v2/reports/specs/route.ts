/**
 * GET  /api/v2/reports/specs    — liste les custom specs (templates) du tenant
 * POST /api/v2/reports/specs    — sauvegarde un nouveau custom spec
 *
 * Alias V2 du store report_templates. Permet aux clients V2 (Studio) de
 * consommer une URL canonique et homogène avec le reste de /api/v2/reports/*.
 *
 * La validation Zod du spec est délégée au store (saveTemplate), qui revalide
 * systématiquement avant écriture.
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
  const { scope, error } = await requireScope({
    context: "GET /api/v2/reports/specs",
  });
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

  const specs = await listTemplates({
    tenantId: scope.tenantId,
    domain: parsed.data.domain,
  });

  return NextResponse.json({
    specs,
    scope: { isDevFallback: scope.isDevFallback },
  });
}

// ── POST ──────────────────────────────────────────────────────

const bodySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  spec: reportSpecSchema,
  isPublic: z.boolean().default(false),
  basedOnSpecId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({
    context: "POST /api/v2/reports/specs",
  });
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

  // Force le scope du caller dans le spec (sécurité). Le builder côté Studio
  // peut envoyer un scope « démo » — on le réécrit ici.
  const sealedSpec = {
    ...parsed.data.spec,
    scope: {
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
    },
  };

  const template = await saveTemplate({
    tenantId: scope.tenantId,
    userId: scope.userId,
    name: parsed.data.name,
    description: parsed.data.description,
    spec: sealedSpec,
    isPublic: parsed.data.isPublic,
  });

  if (!template) {
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ template }, { status: 201 });
}
