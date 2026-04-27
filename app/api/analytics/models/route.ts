import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { ok, err } from "@/lib/domain/api-helpers";
import { scoreModels, selectModel, type ModelGoal } from "@/lib/decisions/model-selector";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sb = requireServerSupabase();
  const days = Number(req.nextUrl.searchParams.get("days") ?? "14");
  const goal = (req.nextUrl.searchParams.get("goal") ?? "balanced") as ModelGoal;

  try {
    const scores = await scoreModels(sb, { days });
    const selection = selectModel(scores, goal);

    return ok({ data: { scores, selection } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("analytics/models error:", msg);
    return err(msg, 500);
  }
}
