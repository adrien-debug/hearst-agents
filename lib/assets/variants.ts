/**
 * Asset Variants — CRUD pour la table `asset_variants` (migration 0028).
 *
 * Un Asset peut avoir N variants — texte (default), audio (TTS), vidéo
 * (avatar HeyGen), slides, site, image, code. Les workers Phase B
 * écrivent ici via `createVariant()` ; le FocalStage lit via
 * `getVariantsForAsset()`.
 */

import { getServerSupabase } from "@/lib/platform/db/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rawDb(sb: ReturnType<typeof getServerSupabase>): SupabaseClient<any> | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sb as unknown as SupabaseClient<any> | null;
}

export type AssetVariantKind = "text" | "audio" | "video" | "slides" | "site" | "image" | "code";
type AssetVariantStatus = "pending" | "generating" | "ready" | "failed";

export interface AssetVariant {
  id: string;
  assetId: string;
  kind: AssetVariantKind;
  status: AssetVariantStatus;
  jobId?: string;
  storageUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  generatedAt?: number;
  provider?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

interface CreateVariantInput {
  assetId: string;
  kind: AssetVariantKind;
  status?: AssetVariantStatus;
  jobId?: string;
  provider?: string;
}

export async function createVariant(input: CreateVariantInput): Promise<string | null> {
  const sb = getServerSupabase();
  if (!sb) return null;

  const { data, error } = await rawDb(sb)!
    .from("asset_variants")
    .insert({
      asset_id: input.assetId,
      kind: input.kind,
      status: input.status ?? "pending",
      job_id: input.jobId ?? null,
      provider: input.provider ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[Variants] insert failed:", error?.message);
    return null;
  }

  return (data as { id: string }).id;
}

interface UpdateVariantInput {
  status?: AssetVariantStatus;
  storageUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  generatedAt?: number;
  provider?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export async function updateVariant(
  variantId: string,
  patch: UpdateVariantInput,
): Promise<void> {
  const sb = getServerSupabase();
  if (!sb) return;

  const update: Record<string, unknown> = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.storageUrl !== undefined) update.storage_url = patch.storageUrl;
  if (patch.mimeType !== undefined) update.mime_type = patch.mimeType;
  if (patch.sizeBytes !== undefined) update.size_bytes = patch.sizeBytes;
  if (patch.durationSeconds !== undefined) update.duration_seconds = patch.durationSeconds;
  if (patch.generatedAt !== undefined) {
    update.generated_at = new Date(patch.generatedAt).toISOString();
  }
  if (patch.provider !== undefined) update.provider = patch.provider;
  if (patch.error !== undefined) update.error = patch.error;
  if (patch.metadata !== undefined) update.metadata = patch.metadata;

  const { error } = await rawDb(sb)!
    .from("asset_variants")
    .update(update)
    .eq("id", variantId);

  if (error) {
    console.error("[Variants] update failed:", error.message);
  }
}

export async function getVariantsForAsset(assetId: string): Promise<AssetVariant[]> {
  const sb = getServerSupabase();
  if (!sb) return [];

  const { data, error } = await rawDb(sb)!
    .from("asset_variants")
    .select("*")
    .eq("asset_id", assetId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map(rowToVariant);
}

function rowToVariant(row: Record<string, unknown>): AssetVariant {
  return {
    id: row.id as string,
    assetId: row.asset_id as string,
    kind: row.kind as AssetVariantKind,
    status: row.status as AssetVariantStatus,
    jobId: (row.job_id as string | undefined) ?? undefined,
    storageUrl: (row.storage_url as string | undefined) ?? undefined,
    mimeType: (row.mime_type as string | undefined) ?? undefined,
    sizeBytes: (row.size_bytes as number | undefined) ?? undefined,
    durationSeconds: (row.duration_seconds as number | undefined) ?? undefined,
    generatedAt: row.generated_at ? new Date(row.generated_at as string).getTime() : undefined,
    provider: (row.provider as string | undefined) ?? undefined,
    error: (row.error as string | undefined) ?? undefined,
    metadata: (row.metadata as Record<string, unknown> | undefined) ?? undefined,
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
  };
}
