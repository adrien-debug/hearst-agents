import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { requireScope } from "@/lib/platform/auth/scope";
import { ok, err, parseBody } from "@/lib/domain/api-helpers";
import { listAdapters } from "@/lib/integrations";
import type { Json } from "@/lib/database.types";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createConnectionSchema = z.object({
  provider: z.string().min(1),
  name: z.string().min(1).max(200),
  auth_type: z.enum(["none", "api_key", "oauth2", "bearer"]).default("none"),
  credentials: z.record(z.string(), z.unknown()).default({}),
  scopes: z.array(z.string()).default([]),
  config: z.record(z.string(), z.unknown()).default({}),
});

export async function GET() {
  const auth = await requireScope({ context: "GET /api/integrations" });
  if (auth.error) return err(auth.error.message, auth.error.status);

  const sb = requireServerSupabase();

  const { data, error } = await sb
    .from("integration_connections")
    .select("id, provider, name, auth_type, scopes, status, health, last_health_check, created_at")
    .order("created_at", { ascending: false });

  if (error) return err(error.message, 500);

  return ok({
    data,
    adapters: listAdapters(),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireScope({ context: "POST /api/integrations" });
  if (auth.error) return err(auth.error.message, auth.error.status);

  let body: unknown;
  try { body = await req.json(); } catch { return err("Invalid JSON", 400); }

  const parsed = parseBody(createConnectionSchema, body);
  if (!parsed.success) return parsed.response;

  const sb = requireServerSupabase();

  const { data, error } = await sb
    .from("integration_connections")
    .insert({
      provider: parsed.data.provider,
      name: parsed.data.name,
      auth_type: parsed.data.auth_type,
      credentials: parsed.data.credentials as unknown as Json,
      scopes: parsed.data.scopes,
      config: parsed.data.config as unknown as Json,
    })
    .select("id, provider, name, auth_type, scopes, status, health, created_at")
    .single();

  if (error) return err(error.message, 500);
  return ok({ data }, 201);
}
