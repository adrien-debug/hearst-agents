/**
 * report_versions — store Supabase + validation Zod.
 *
 * Règles invariantes :
 *  - Historique immuable : append-only, jamais de DELETE ni d'UPDATE.
 *  - version_number auto-incrémenté : MAX(version_number) + 1 par asset_id.
 *  - Isolation tenant : toutes les opérations exigent tenantId explicite.
 *  - Snapshot complet : spec + render_snapshot + signals + narration.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import type { RenderPayload } from "@/lib/reports/engine/render-blocks";
import type { ReportSpec } from "@/lib/reports/spec/schema";
import type { BusinessSignal } from "@/lib/reports/signals/extract";

// ── Schémas Zod ───────────────────────────────────────────────

export const createVersionInputSchema = z.object({
  assetId: z.string().min(1).max(200),
  tenantId: z.string().min(1).max(120),
  spec: z.record(z.string(), z.unknown()),
  renderPayload: z.record(z.string(), z.unknown()),
  signals: z.array(z.unknown()).optional(),
  narration: z.string().nullable().optional(),
  triggeredBy: z.enum(["manual", "scheduled", "api"]).default("manual"),
});
export type CreateVersionInput = z.infer<typeof createVersionInputSchema>;

export const listVersionsInputSchema = z.object({
  assetId: z.string().min(1).max(200),
  tenantId: z.string().min(1).max(120),
  limit: z.number().int().min(1).max(200).default(50),
});
export type ListVersionsInput = z.infer<typeof listVersionsInputSchema>;

export const getVersionInputSchema = z.object({
  assetId: z.string().min(1).max(200),
  versionNumber: z.number().int().min(1),
  tenantId: z.string().min(1).max(120),
});
export type GetVersionInput = z.infer<typeof getVersionInputSchema>;

export const getLatestVersionInputSchema = z.object({
  assetId: z.string().min(1).max(200),
  tenantId: z.string().min(1).max(120),
});
export type GetLatestVersionInput = z.infer<typeof getLatestVersionInputSchema>;

// ── Types de sortie ───────────────────────────────────────────

/** Métadonnées sans le render_snapshot — pour la liste. */
export interface VersionSummary {
  id: string;
  assetId: string;
  tenantId: string;
  versionNumber: number;
  triggeredBy: "manual" | "scheduled" | "api";
  signalsCount: number;
  createdAt: string;
}

/** Version complète avec snapshots. */
export interface VersionFull extends VersionSummary {
  specSnapshot: ReportSpec;
  renderSnapshot: RenderPayload;
  signalsSnapshot: BusinessSignal[] | null;
  narrationSnapshot: string | null;
}

// ── Row mapping ───────────────────────────────────────────────

interface VersionRow {
  id: string;
  asset_id: string;
  tenant_id: string;
  version_number: number;
  spec_snapshot: unknown;
  render_snapshot: unknown;
  signals_snapshot: unknown;
  narration_snapshot: string | null;
  triggered_by: string;
  created_at: string;
}

function rowToSummary(row: VersionRow): VersionSummary {
  const signals = (row.signals_snapshot as unknown[] | null) ?? [];
  return {
    id: row.id,
    assetId: row.asset_id,
    tenantId: row.tenant_id,
    versionNumber: row.version_number,
    triggeredBy: row.triggered_by as "manual" | "scheduled" | "api",
    signalsCount: Array.isArray(signals) ? signals.length : 0,
    createdAt: row.created_at,
  };
}

function rowToFull(row: VersionRow): VersionFull {
  return {
    ...rowToSummary(row),
    specSnapshot: row.spec_snapshot as ReportSpec,
    renderSnapshot: row.render_snapshot as RenderPayload,
    signalsSnapshot: (row.signals_snapshot as BusinessSignal[]) ?? null,
    narrationSnapshot: row.narration_snapshot,
  };
}

// ── Helper Supabase ───────────────────────────────────────────

function getClient(client?: SupabaseClient): SupabaseClient | null {
  return client ?? (getServerSupabase() as SupabaseClient | null);
}

// ── API publique ──────────────────────────────────────────────

/**
 * Crée une nouvelle version. Le version_number est calculé comme
 * MAX(version_number) + 1 pour cet assetId (atomic via transaction Postgres
 * simulée : on lit puis on insère avec UNIQUE constraint comme filet).
 *
 * Retourne le summary de la version créée, ou null si Supabase indispo.
 */
export async function createVersion(
  rawInput: CreateVersionInput,
  client?: SupabaseClient,
): Promise<VersionSummary | null> {
  const input = createVersionInputSchema.parse(rawInput);
  const sb = getClient(client);
  if (!sb) return null;

  // Calcul du prochain version_number.
  const { data: maxRow } = await sb
    .from("report_versions")
    .select("version_number")
    .eq("asset_id", input.assetId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = ((maxRow as { version_number: number } | null)?.version_number ?? 0) + 1;

  const { data, error } = await sb
    .from("report_versions")
    .insert({
      asset_id: input.assetId,
      tenant_id: input.tenantId,
      version_number: nextVersion,
      spec_snapshot: input.spec,
      render_snapshot: input.renderPayload,
      signals_snapshot: input.signals ?? null,
      narration_snapshot: input.narration ?? null,
      triggered_by: input.triggeredBy,
    })
    .select("id, asset_id, tenant_id, version_number, signals_snapshot, triggered_by, created_at")
    .single();

  if (error) {
    console.error("[report_versions] insert error:", error.message);
    return null;
  }

  const row = data as {
    id: string;
    asset_id: string;
    tenant_id: string;
    version_number: number;
    signals_snapshot: unknown;
    triggered_by: string;
    created_at: string;
  };
  const signals = (row.signals_snapshot as unknown[] | null) ?? [];
  return {
    id: row.id,
    assetId: row.asset_id,
    tenantId: row.tenant_id,
    versionNumber: row.version_number,
    triggeredBy: row.triggered_by as "manual" | "scheduled" | "api",
    signalsCount: Array.isArray(signals) ? signals.length : 0,
    createdAt: row.created_at,
  };
}

/**
 * Liste les versions d'un asset (métadonnées seulement, sans render_snapshot).
 * Triées version_number DESC (la plus récente en premier).
 */
export async function listVersions(
  rawInput: ListVersionsInput,
  client?: SupabaseClient,
): Promise<VersionSummary[]> {
  const input = listVersionsInputSchema.parse(rawInput);
  const sb = getClient(client);
  if (!sb) return [];

  const { data, error } = await sb
    .from("report_versions")
    .select("id, asset_id, tenant_id, version_number, signals_snapshot, triggered_by, created_at")
    .eq("asset_id", input.assetId)
    .eq("tenant_id", input.tenantId)
    .order("version_number", { ascending: false })
    .limit(input.limit);

  if (error) {
    console.error("[report_versions] list error:", error.message);
    return [];
  }
  return ((data as VersionRow[]) ?? []).map(rowToSummary);
}

/**
 * Retourne une version complète (avec render_snapshot) par numéro.
 * Vérifie l'isolation tenant.
 */
export async function getVersion(
  rawInput: GetVersionInput,
  client?: SupabaseClient,
): Promise<VersionFull | null> {
  const input = getVersionInputSchema.parse(rawInput);
  const sb = getClient(client);
  if (!sb) return null;

  const { data, error } = await sb
    .from("report_versions")
    .select("*")
    .eq("asset_id", input.assetId)
    .eq("version_number", input.versionNumber)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();

  if (error) {
    console.error("[report_versions] get error:", error.message);
    return null;
  }
  if (!data) return null;
  return rowToFull(data as VersionRow);
}

/**
 * Retourne la dernière version (version_number le plus élevé) d'un asset.
 */
export async function getLatestVersion(
  rawInput: GetLatestVersionInput,
  client?: SupabaseClient,
): Promise<VersionFull | null> {
  const input = getLatestVersionInputSchema.parse(rawInput);
  const sb = getClient(client);
  if (!sb) return null;

  const { data, error } = await sb
    .from("report_versions")
    .select("*")
    .eq("asset_id", input.assetId)
    .eq("tenant_id", input.tenantId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[report_versions] get-latest error:", error.message);
    return null;
  }
  if (!data) return null;
  return rowToFull(data as VersionRow);
}
