import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { requireScope } from "@/lib/platform/auth/scope";
import { ok, err, dbErr, parseBody } from "@/lib/domain";
import { slugify } from "@/lib/domain/slugify";
import { z } from "zod";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

const createPromptSchema = z.object({
  slug: z.string().min(1).max(200).optional(),
  name: z.string().min(1).max(200),
  kind: z.enum([
    "system_prompt", "skill_prompt", "workflow_instruction",
    "tool_template", "guard_prompt", "eval_prompt", "custom",
  ]),
  scope: z.enum(["global", "agent", "skill", "workflow"]).default("global"),
  content: z.string().min(1),
  description: z.string().max(2000).optional(),
  agent_id: z.string().uuid().optional(),
  skill_id: z.string().uuid().optional(),
  workflow_id: z.string().uuid().optional(),
  created_by: z.string().max(200).optional(),
  metadata: z.record(z.string(), z.any()).default({}),
});

export async function GET() {
  try {
    const auth = await requireScope({ context: "GET /api/prompts" });
    if (auth.error) return err(auth.error.message, auth.error.status);

    const sb = requireServerSupabase();
    const { data, error } = await sb
      .from("prompt_artifacts")
      .select("id, slug, version, kind, scope, description, content_hash, agent_id, skill_id, workflow_id, created_by, created_at")
      .order("slug", { ascending: true })
      .order("version", { ascending: false });

    if (error) return dbErr("GET /api/prompts", error);
    return ok({ prompts: data ?? [] });
  } catch (e) {
    console.error("GET /api/prompts: uncaught", e);
    return err("internal_error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireScope({ context: "POST /api/prompts" });
    if (auth.error) return err(auth.error.message, auth.error.status);

    const body = await req.json();
    const parsed = parseBody(createPromptSchema, body);
    if (!parsed.success) return parsed.response;

    const sb = requireServerSupabase();
    const slug = parsed.data.slug ?? slugify(parsed.data.name);
    const contentHash = createHash("sha256").update(parsed.data.content).digest("hex").slice(0, 16);

    // Determine next version for this slug
    const { data: existing } = await sb
      .from("prompt_artifacts")
      .select("version")
      .eq("slug", slug)
      .order("version", { ascending: false })
      .limit(1);

    const nextVersion = existing && existing.length > 0 ? existing[0].version + 1 : 1;
    const parentId = existing && existing.length > 0
      ? (await sb.from("prompt_artifacts").select("id").eq("slug", slug).eq("version", existing[0].version).single()).data?.id ?? null
      : null;

    // Check for duplicate content
    if (existing && existing.length > 0) {
      const { data: lastArtifact } = await sb
        .from("prompt_artifacts")
        .select("content_hash")
        .eq("slug", slug)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      if (lastArtifact?.content_hash === contentHash) {
        return err("Content unchanged — no new version created", 409);
      }
    }

    const { data, error } = await sb
      .from("prompt_artifacts")
      .insert({
        slug,
        version: nextVersion,
        kind: parsed.data.kind,
        scope: parsed.data.scope,
        content: parsed.data.content,
        content_hash: contentHash,
        description: parsed.data.description ?? null,
        agent_id: parsed.data.agent_id ?? null,
        skill_id: parsed.data.skill_id ?? null,
        workflow_id: parsed.data.workflow_id ?? null,
        parent_id: parentId,
        metadata: parsed.data.metadata,
        created_by: parsed.data.created_by ?? null,
      })
      .select()
      .single();

    if (error) return dbErr("POST /api/prompts", error);
    return ok({ prompt: data }, 201);
  } catch (e) {
    console.error("POST /api/prompts: uncaught", e);
    return err("internal_error", 500);
  }
}
