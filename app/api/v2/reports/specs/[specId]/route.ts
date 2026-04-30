/**
 * GET    /api/v2/reports/specs/[specId] — charge le spec d'un custom report
 * PATCH  /api/v2/reports/specs/[specId] — met à jour nom/desc/spec/isPublic
 * DELETE /api/v2/reports/specs/[specId] — supprime (créateur uniquement)
 *
 * Alias V2 du store report_templates. La validation Zod du spec est appliquée
 * au PATCH si un nouveau spec est fourni.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { reportSpecSchema } from "@/lib/reports/spec/schema";
import {
  loadTemplate,
  deleteTemplate,
  updateTemplate,
} from "@/lib/reports/templates/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET ───────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ specId: string }> },
) {
  const { scope, error } = await requireScope({
    context: "GET /api/v2/reports/specs/[id]",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const { specId } = await params;
  if (!specId) {
    return NextResponse.json({ error: "missing_spec_id" }, { status: 400 });
  }

  const spec = await loadTemplate({
    templateId: specId,
    tenantId: scope.tenantId,
  });

  if (!spec) {
    return NextResponse.json({ error: "spec_not_found" }, { status: 404 });
  }

  return NextResponse.json({ spec });
}

// ── PATCH ─────────────────────────────────────────────────────

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  spec: reportSpecSchema.optional(),
  isPublic: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ specId: string }> },
) {
  const { scope, error } = await requireScope({
    context: "PATCH /api/v2/reports/specs/[id]",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const { specId } = await params;
  if (!specId) {
    return NextResponse.json({ error: "missing_spec_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Si le caller envoie un nouveau spec, on force son scope.
  const patch = { ...parsed.data };
  if (patch.spec) {
    patch.spec = {
      ...patch.spec,
      scope: {
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        userId: scope.userId,
      },
    };
  }

  const updated = await updateTemplate({
    templateId: specId,
    tenantId: scope.tenantId,
    userId: scope.userId,
    patch,
  });

  if (!updated) {
    return NextResponse.json(
      { error: "update_failed_or_forbidden" },
      { status: 404 },
    );
  }

  return NextResponse.json({ template: updated });
}

// ── DELETE ────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ specId: string }> },
) {
  const { scope, error } = await requireScope({
    context: "DELETE /api/v2/reports/specs/[id]",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const { specId } = await params;
  if (!specId) {
    return NextResponse.json({ error: "missing_spec_id" }, { status: 400 });
  }

  await deleteTemplate({
    templateId: specId,
    tenantId: scope.tenantId,
    userId: scope.userId,
  });

  return NextResponse.json({ deleted: true });
}
