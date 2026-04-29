/**
 * report_exports — persistence + upload via storage provider.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import { getGlobalStorage } from "@/lib/engine/runtime/assets/storage";
import { EXPORT_STORAGE_PREFIX, type ExportResult } from "./types";

export interface PersistExportInput {
  result: ExportResult;
  format: "pdf" | "xlsx";
  assetId: string;
  tenantId: string;
  createdBy?: string | null;
  missionId?: string | null;
}

export interface PersistExportOutcome {
  storageKey: string;
  storageUrl: string;
  exportRowId: string | null;
}

function buildStorageKey(input: PersistExportInput): string {
  const ts = Date.now();
  const safeAsset = input.assetId.replace(/[^a-zA-Z0-9-_]+/g, "_");
  return `${EXPORT_STORAGE_PREFIX}/${input.tenantId}/${safeAsset}/${ts}.${input.format}`;
}

export async function persistExport(
  input: PersistExportInput,
  client?: SupabaseClient,
): Promise<PersistExportOutcome> {
  const storage = getGlobalStorage();
  const key = buildStorageKey(input);

  const upload = await storage.upload(key, input.result.buffer, {
    contentType: input.result.contentType,
    metadata: {
      assetId: input.assetId,
      tenantId: input.tenantId,
      format: input.format,
    },
    tenantId: input.tenantId,
  });

  const sb = client ?? getServerSupabase();
  let exportRowId: string | null = null;
  if (sb) {
    const { data, error } = await sb
      .from("report_exports")
      .insert({
        asset_id: input.assetId,
        tenant_id: input.tenantId,
        format: input.format,
        storage_key: upload.key,
        size_bytes: input.result.size,
        created_by: input.createdBy ?? null,
        mission_id: input.missionId ?? null,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[export.store] insert error:", error.message);
    } else {
      exportRowId = (data as { id: string } | null)?.id ?? null;
    }
  }

  return {
    storageKey: upload.key,
    storageUrl: upload.url,
    exportRowId,
  };
}

const SIGNED_URL_DEFAULT_SECONDS = 3600;

export async function getExportSignedUrl(
  storageKey: string,
  options: { expiresInSeconds?: number; downloadName?: string } = {},
): Promise<string> {
  const storage = getGlobalStorage();
  return storage.getSignedUrl(storageKey, "read", {
    expiresInSeconds: options.expiresInSeconds ?? SIGNED_URL_DEFAULT_SECONDS,
    responseContentDisposition: options.downloadName
      ? `attachment; filename="${options.downloadName}"`
      : undefined,
  });
}
