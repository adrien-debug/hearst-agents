/**
 * GET /api/v2/simulations/history?limit=20
 *
 * Liste les simulation_runs précédentes du user (history sidebar SimulationStage).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { requireServerSupabase } from "@/lib/platform/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

interface SimulationHistoryItem {
  id: string;
  scenarioInput: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  assetId: string | null;
}

export async function GET(req: NextRequest) {
  const { scope, error: scopeError } = await requireScope({
    context: "GET /api/v2/simulations/history",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const sb = requireServerSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("simulation_runs" as any) as any)
      .select("id, scenario_input, status, created_at, completed_at, asset_id")
      .eq("user_id", scope.userId)
      .eq("tenant_id", scope.tenantId)
      .order("created_at", { ascending: false })
      .limit(parsed.data.limit);
    if (error) throw new Error(error.message);

    const runs: SimulationHistoryItem[] = ((data ?? []) as Array<{
      id: string;
      scenario_input: string;
      status: string;
      created_at: string;
      completed_at: string | null;
      asset_id: string | null;
    }>).map((row) => ({
      id: row.id,
      scenarioInput: row.scenario_input,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      assetId: row.asset_id,
    }));

    return NextResponse.json({ runs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[simulations/history] failed:", message);
    return NextResponse.json({ error: "history_failed", message }, { status: 500 });
  }
}
