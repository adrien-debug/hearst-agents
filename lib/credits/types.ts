/**
 * Credits Ledger — Types canoniques.
 *
 * Modèle : balance USD (numeric 18,6) avec reserve/settle pattern.
 * Les fonctions SQL atomiques (reserve_credits, settle_credits) garantissent
 * la concurrence safe — voir migration 0030_credits_ledger.sql.
 */

import type { JobKind } from "@/lib/jobs/types";

export type CreditOperation =
  | "purchase"
  | "refund"
  | "job_debit"
  | "job_settle"
  | "admin_grant"
  | "trial_grant";

export interface CreditBalance {
  userId: string;
  tenantId: string;
  balanceUsd: number;
  reservedUsd: number;
  availableUsd: number;
  updatedAt: number;
}

export interface CreditLedgerEntry {
  id: string;
  userId: string;
  tenantId: string;
  operation: CreditOperation;
  amountUsd: number;
  balanceAfterUsd: number;
  jobId?: string;
  jobKind?: JobKind;
  description: string;
  createdAt: number;
}

export interface CreditGuardResult {
  allowed: boolean;
  availableUsd: number;
  estimatedCostUsd: number;
  reason?: string;
}

export interface ReserveCreditsArgs {
  userId: string;
  tenantId: string;
  amountUsd: number;
  jobId: string;
  jobKind: JobKind;
}

export interface SettleCreditsArgs {
  userId: string;
  tenantId: string;
  reservedUsd: number;
  actualUsd: number;
  jobId: string;
  jobKind: JobKind;
  description: string;
}
