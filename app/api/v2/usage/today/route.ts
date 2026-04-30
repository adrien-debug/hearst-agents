/**
 * GET /api/v2/usage/today — Cost meter live pour le PulseBar.
 *
 * Retourne la dépense LLM/tools du user pour la journée courante (UTC) +
 * son budget effectif. Source de vérité : `runs.cost_usd` agrégé sur
 * `started_at >= début_du_jour`.
 *
 * Fail-soft : si Supabase n'est pas dispo ou que la table ne renvoie rien,
 * on retourne des zéros + le budget par défaut. Le PulseBar n'affiche
 * jamais "—" tant qu'on a au moins le budget.
 *
 * Pas de cache HTTP — l'UI poll toutes les 60s et le coût bouge en
 * temps quasi-réel pendant un run actif.
 */

import { NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { requireServerSupabase } from "@/lib/platform/db/supabase";

export const dynamic = "force-dynamic";

/**
 * Budget par défaut (USD) si aucun n'est configuré côté tenant.
 * Choisi pour rester sous la barre psychologique du dollar / jour.
 */
const DEFAULT_DAILY_BUDGET_USD = 5.0;

interface UsageTodayResponse {
  usedUSD: number;
  budgetUSD: number;
  runs: number;
  /** ISO du début de la fenêtre comptée (UTC). */
  windowStart: string;
}

export async function GET() {
  const { scope, error } = await requireScope({
    context: "GET /api/v2/usage/today",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const windowStart = startOfTodayUtc();

  try {
    const db = requireServerSupabase();
    const { data, error: dbError } = await db
      .from("runs")
      .select("cost_usd")
      .eq("user_id", scope.userId)
      .gte("started_at", windowStart);

    if (dbError) {
      console.warn("[usage/today] runs query failed:", dbError.message);
      return NextResponse.json(emptyResponse(windowStart));
    }

    const rows = (data ?? []) as Array<{ cost_usd: number | null }>;
    const usedUSD = rows.reduce(
      (acc, r) => acc + Number(r.cost_usd ?? 0),
      0,
    );

    const payload: UsageTodayResponse = {
      usedUSD: round2(usedUSD),
      budgetUSD: DEFAULT_DAILY_BUDGET_USD,
      runs: rows.length,
      windowStart,
    };
    return NextResponse.json(payload);
  } catch (e) {
    console.warn(
      "[usage/today] fail-soft fallback:",
      e instanceof Error ? e.message : String(e),
    );
    return NextResponse.json(emptyResponse(windowStart));
  }
}

function startOfTodayUtc(): string {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return start.toISOString();
}

function emptyResponse(windowStart: string): UsageTodayResponse {
  return {
    usedUSD: 0,
    budgetUSD: DEFAULT_DAILY_BUDGET_USD,
    runs: 0,
    windowStart,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
