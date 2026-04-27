import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { createSkillSchema, ok, err, parseBody, dbErr, slugify } from "@/lib/domain";
import type { Database } from "@/lib/database.types";

type SkillInsert = Database["public"]["Tables"]["skills"]["Insert"];

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = requireServerSupabase();
    const { data, error } = await sb
      .from("skills")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return dbErr("GET /api/skills", error);
    return ok({ skills: data ?? [] });
  } catch (e) {
    console.error("GET /api/skills: uncaught", e);
    return err("internal_error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(createSkillSchema, body);
    if (!parsed.success) return parsed.response;

    const sb = requireServerSupabase();
    const input = parsed.data;
    const slug = input.slug ?? slugify(input.name);

    const row: SkillInsert = {
      name: input.name,
      slug,
      category: input.category,
      description: input.description ?? null,
      prompt_template: input.prompt_template,
      input_schema: input.input_schema as SkillInsert["input_schema"],
      output_schema: input.output_schema as SkillInsert["output_schema"],
    };

    const { data, error } = await sb
      .from("skills")
      .insert(row)
      .select()
      .single();

    if (error) return dbErr("POST /api/skills", error);
    return ok({ skill: data }, 201);
  } catch (e) {
    console.error("POST /api/skills: uncaught", e);
    return err("internal_error", 500);
  }
}
