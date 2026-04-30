/**
 * GET    /api/v2/personas/[id]   — détail
 * PATCH  /api/v2/personas/[id]   — mise à jour partielle
 * DELETE /api/v2/personas/[id]   — suppression
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import {
  getPersonaById,
  updatePersona,
  deletePersona,
} from "@/lib/personas/store";
import type { PersonaUpdate, PersonaTone } from "@/lib/personas/types";
import { PERSONA_TONES } from "@/lib/personas/types";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asTone(v: unknown): PersonaTone | null | undefined {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  return (PERSONA_TONES as string[]).includes(v) ? (v as PersonaTone) : undefined;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { scope, error } = await requireScope({
    context: "GET /api/v2/personas/[id]",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const { id } = await ctx.params;
  const persona = await getPersonaById(id, {
    userId: scope.userId,
    tenantId: scope.tenantId,
  });
  if (!persona) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ persona });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { scope, error } = await requireScope({
    context: "PATCH /api/v2/personas/[id]",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const { id } = await ctx.params;

  if (id.startsWith("builtin:")) {
    return NextResponse.json(
      { error: "builtin_immutable", message: "Les personas builtin ne sont pas modifiables." },
      { status: 400 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const patch: PersonaUpdate = {};
  if ("name" in payload) {
    const v = asString(payload.name);
    if (v) patch.name = v.slice(0, 80);
  }
  if ("description" in payload) {
    const v = asString(payload.description);
    patch.description = v ? v.slice(0, 280) : undefined;
  }
  if ("tone" in payload) {
    const v = asTone(payload.tone);
    if (v !== undefined) patch.tone = v;
  }
  if ("vocabulary" in payload && typeof payload.vocabulary === "object") {
    patch.vocabulary = payload.vocabulary as PersonaUpdate["vocabulary"];
  }
  if ("styleGuide" in payload) {
    const v = asString(payload.styleGuide);
    patch.styleGuide = v ? v.slice(0, 2000) : null;
  }
  if ("systemPromptAddon" in payload) {
    const v = asString(payload.systemPromptAddon);
    patch.systemPromptAddon = v ? v.slice(0, 1500) : null;
  }
  if ("surface" in payload) {
    const v = asString(payload.surface);
    patch.surface = v ?? null;
  }
  if ("isDefault" in payload && typeof payload.isDefault === "boolean") {
    patch.isDefault = payload.isDefault;
  }

  const updated = await updatePersona(
    id,
    { userId: scope.userId, tenantId: scope.tenantId },
    patch,
  );
  if (!updated) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ persona: updated });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { scope, error } = await requireScope({
    context: "DELETE /api/v2/personas/[id]",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const { id } = await ctx.params;
  if (id.startsWith("builtin:")) {
    return NextResponse.json(
      { error: "builtin_immutable", message: "Builtin non supprimable." },
      { status: 400 },
    );
  }
  const ok = await deletePersona(id, {
    userId: scope.userId,
    tenantId: scope.tenantId,
  });
  if (!ok) {
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
