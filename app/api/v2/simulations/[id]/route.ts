/**
 * GET /api/v2/simulations/[id]
 *
 * Retourne le détail d'un simulation_run (status, reasoning, scenarios).
 * Utilisé par SimulationStage pour load-on-mount + après stream completion.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { requireServerSupabase } from "@/lib/platform/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const { scope, error: scopeError } = await requireScope({
    context: "GET /api/v2/simulations/[id]",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  try {
    const sb = requireServerSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("simulation_runs" as any) as any)
      .select("*")
      .eq("id", id)
      .eq("user_id", scope.userId)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const row = data as {
      id: string;
      scenario_input: string;
      variables: unknown;
      status: string;
      reasoning: string | null;
      scenarios: unknown;
      asset_id: string | null;
      error_message: string | null;
      created_at: string;
      completed_at: string | null;
    };

    return NextResponse.json({
      id: row.id,
      scenarioInput: row.scenario_input,
      variables: row.variables ?? [],
      status: row.status,
      reasoning: row.reasoning,
      scenarios: row.scenarios,
      assetId: row.asset_id,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[simulations/get] failed:", message);
    return NextResponse.json({ error: "get_failed", message }, { status: 500 });
  }
}
