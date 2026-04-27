import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { ok, err } from "@/lib/domain/api-helpers";
import { listChanges } from "@/lib/decisions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sb = requireServerSupabase();
  const targetId = req.nextUrl.searchParams.get("target_id") ?? undefined;
  const targetType = req.nextUrl.searchParams.get("target_type") ?? undefined;
  const changeType = req.nextUrl.searchParams.get("change_type") ?? undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "50");

  const { data, error: dbErr } = await listChanges(sb, {
    target_id: targetId,
    target_type: targetType,
    change_type: changeType,
    limit,
  });

  if (dbErr) return err(dbErr.message, 500);
  return ok({ data });
}
