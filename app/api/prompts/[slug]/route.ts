import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { ok, err, dbErr } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const version = req.nextUrl.searchParams.get("version");

  try {
    const sb = requireServerSupabase();

    if (version) {
      const { data, error } = await sb
        .from("prompt_artifacts")
        .select("*")
        .eq("slug", slug)
        .eq("version", parseInt(version, 10))
        .single();

      if (error) return dbErr(`GET /api/prompts/${slug}?version=${version}`, error);
      return ok({ prompt: data });
    }

    // Return all versions for this slug
    const { data, error } = await sb
      .from("prompt_artifacts")
      .select("*")
      .eq("slug", slug)
      .order("version", { ascending: false });

    if (error) return dbErr(`GET /api/prompts/${slug}`, error);
    if (!data || data.length === 0) return err("prompt_not_found", 404);

    return ok({
      slug,
      latest: data[0],
      versions: data,
    });
  } catch (e) {
    console.error(`GET /api/prompts/${slug}: uncaught`, e);
    return err("internal_error", 500);
  }
}
