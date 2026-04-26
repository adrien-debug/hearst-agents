import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { requireScope } from "@/lib/scope";
import { createToolSchema, ok, err, parseBody, dbErr, slugify } from "@/lib/domain";
import type { Database } from "@/lib/database.types";

type ToolInsert = Database["public"]["Tables"]["tools"]["Insert"];

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireScope({ context: "GET /api/tools" });
    if (auth.error) return err(auth.error.message, auth.error.status);

    const sb = requireServerSupabase();
    const { data, error } = await sb
      .from("tools")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return dbErr("GET /api/tools", error);
    return ok({ tools: data ?? [] });
  } catch (e) {
    console.error("GET /api/tools: uncaught", e);
    return err("internal_error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireScope({ context: "POST /api/tools" });
    if (auth.error) return err(auth.error.message, auth.error.status);

    const body = await req.json();
    const parsed = parseBody(createToolSchema, body);
    if (!parsed.success) return parsed.response;

    const sb = requireServerSupabase();
    const input = parsed.data;
    const slug = input.slug ?? slugify(input.name);

    const row: ToolInsert = {
      name: input.name,
      slug,
      description: input.description ?? null,
      endpoint_url: input.endpoint_url ?? null,
      http_method: input.http_method,
      input_schema: input.input_schema as ToolInsert["input_schema"],
      output_schema: input.output_schema as ToolInsert["output_schema"],
      auth_type: input.auth_type,
      auth_config: input.auth_config as ToolInsert["auth_config"],
      timeout_ms: input.timeout_ms,
    };

    const { data, error } = await sb
      .from("tools")
      .insert(row)
      .select()
      .single();

    if (error) return dbErr("POST /api/tools", error);
    return ok({ tool: data }, 201);
  } catch (e) {
    console.error("POST /api/tools: uncaught", e);
    return err("internal_error", 500);
  }
}
