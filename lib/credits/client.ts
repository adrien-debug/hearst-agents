/**
 * Credits client — Wrappers TypeScript sur les fonctions SQL atomiques.
 *
 * Toutes les écritures passent par les fonctions SECURITY DEFINER de
 * la migration 0029 (reserve_credits, settle_credits, grant_trial_credits)
 * pour garantir l'atomicité face à la concurrence.
 *
 * Le service_role bypass RLS pour ces appels (writes côté serveur).
 */

import { getServerSupabase } from "@/lib/platform/db/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreditBalance,
  CreditGuardResult,
  ReserveCreditsArgs,
  SettleCreditsArgs,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rawDb(sb: ReturnType<typeof getServerSupabase>): SupabaseClient<any> | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sb as unknown as SupabaseClient<any> | null;
}

// ── Read ────────────────────────────────────────────────────

async function getBalance(
  userId: string,
  tenantId: string,
): Promise<CreditBalance | null> {
  const sb = getServerSupabase();
  if (!sb) return null;

  const { data, error } = await rawDb(sb)!
    .from("user_credits")
    .select("user_id, tenant_id, balance_usd, reserved_usd, updated_at")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  const balance = Number(row.balance_usd ?? 0);
  const reserved = Number(row.reserved_usd ?? 0);
  return {
    userId: row.user_id as string,
    tenantId: row.tenant_id as string,
    balanceUsd: balance,
    reservedUsd: reserved,
    availableUsd: balance - reserved,
    updatedAt: new Date(row.updated_at as string).getTime(),
  };
}

// ── Reserve / Settle (atomiques via RPC) ────────────────────

async function reserveCredits(args: ReserveCreditsArgs): Promise<boolean> {
  const sb = getServerSupabase();
  if (!sb) {
    console.warn("[Credits] No DB — reserve bypassed (dev mode)");
    return true;
  }

  const { data, error } = await rawDb(sb)!.rpc("reserve_credits", {
    p_user_id: args.userId,
    p_tenant_id: args.tenantId,
    p_amount_usd: args.amountUsd,
    p_job_id: args.jobId,
    p_job_kind: args.jobKind,
  });

  if (error) {
    console.error("[Credits] reserve_credits RPC failed:", error.message);
    return false;
  }

  return data === true;
}

export async function settleCredits(args: SettleCreditsArgs): Promise<void> {
  const sb = getServerSupabase();
  if (!sb) return;

  const { error } = await rawDb(sb)!.rpc("settle_credits", {
    p_user_id: args.userId,
    p_tenant_id: args.tenantId,
    p_reserved_usd: args.reservedUsd,
    p_actual_usd: args.actualUsd,
    p_job_id: args.jobId,
    p_job_kind: args.jobKind,
    p_description: args.description,
  });

  if (error) {
    console.error("[Credits] settle_credits RPC failed:", error.message);
  }
}

// ── Guard pré-job (composite : balance + reserve) ──────────

/**
 * Vérifie qu'un user a les fonds disponibles pour un coût estimé,
 * et réserve immédiatement le montant. Le worker settle ensuite
 * avec le coût réel.
 *
 * Retourne `{ allowed: false }` si solde insuffisant — le caller doit
 * surfacer un message UI au user (ex: "Solde insuffisant, recharge tes
 * crédits ou utilise un provider gratuit").
 */
export async function guardAndReserveCredits(args: {
  userId: string;
  tenantId: string;
  estimatedCostUsd: number;
  jobId: string;
  jobKind: ReserveCreditsArgs["jobKind"];
}): Promise<CreditGuardResult> {
  const balance = await getBalance(args.userId, args.tenantId);
  const available = balance?.availableUsd ?? 0;

  if (available < args.estimatedCostUsd) {
    return {
      allowed: false,
      availableUsd: available,
      estimatedCostUsd: args.estimatedCostUsd,
      reason: "insufficient_credits",
    };
  }

  const reserved = await reserveCredits({
    userId: args.userId,
    tenantId: args.tenantId,
    amountUsd: args.estimatedCostUsd,
    jobId: args.jobId,
    jobKind: args.jobKind,
  });
  if (!reserved) {
    // Race : un autre call a réservé entre temps. Retry pas pertinent —
    // on remonte l'échec au caller.
    return {
      allowed: false,
      availableUsd: available,
      estimatedCostUsd: args.estimatedCostUsd,
      reason: "race_condition",
    };
  }

  return {
    allowed: true,
    availableUsd: available - args.estimatedCostUsd,
    estimatedCostUsd: args.estimatedCostUsd,
  };
}
