import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err } from "@/lib/domain/api-helpers";
import { listSignals } from "@/lib/decisions";
import type { SignalStatus } from "@/lib/decisions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sb = requireServerSupabase();
  const status = (req.nextUrl.searchParams.get("status") ?? undefined) as SignalStatus | undefined;
  const targetType = req.nextUrl.searchParams.get("target_type") ?? undefined;
  const targetId = req.nextUrl.searchParams.get("target_id") ?? undefined;
  const kind = req.nextUrl.searchParams.get("kind") ?? undefined;
  const priority = req.nextUrl.searchParams.get("priority") ?? undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "50");

  const { data, error: dbError } = await listSignals(sb, {
    status,
    target_type: targetType,
    target_id: targetId,
    kind,
    priority,
    limit,
  });

  if (dbError) return err(dbError.message, 500);
  return ok({ data });
}
