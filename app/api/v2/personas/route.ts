/**
 * GET  /api/v2/personas       — liste des personas du user (incluant builtins fallback)
 * POST /api/v2/personas       — crée une nouvelle persona
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import {
  listPersonasForUser,
  createPersona,
} from "@/lib/personas/store";
import type { PersonaInsert, PersonaTone } from "@/lib/personas/types";
import { PERSONA_TONES } from "@/lib/personas/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const { scope, error } = await requireScope({ context: "GET /api/v2/personas" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const personas = await listPersonasForUser(scope.userId, scope.tenantId);
  return NextResponse.json({ personas });
}

interface CreatePayload {
  name?: unknown;
  description?: unknown;
  tone?: unknown;
  vocabulary?: unknown;
  styleGuide?: unknown;
  systemPromptAddon?: unknown;
  surface?: unknown;
  isDefault?: unknown;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}

function asTone(v: unknown): PersonaTone | undefined {
  if (typeof v !== "string") return undefined;
  return (PERSONA_TONES as string[]).includes(v) ? (v as PersonaTone) : undefined;
}

export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({ context: "POST /api/v2/personas" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  let payload: CreatePayload;
  try {
    payload = (await req.json()) as CreatePayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = asString(payload.name);
  if (!name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  const insert: PersonaInsert = {
    userId: scope.userId,
    tenantId: scope.tenantId,
    name: name.slice(0, 80),
    description: asString(payload.description)?.slice(0, 280),
    tone: asTone(payload.tone) ?? null,
    vocabulary:
      payload.vocabulary && typeof payload.vocabulary === "object"
        ? (payload.vocabulary as PersonaInsert["vocabulary"])
        : null,
    styleGuide: asString(payload.styleGuide)?.slice(0, 2000) ?? null,
    systemPromptAddon: asString(payload.systemPromptAddon)?.slice(0, 1500) ?? null,
    surface: asString(payload.surface) ?? null,
    isDefault: payload.isDefault === true,
  };

  try {
    const persona = await createPersona(insert);
    return NextResponse.json({ persona }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "create_failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
