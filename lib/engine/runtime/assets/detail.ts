/**
 * Asset Detail Loader — resolves asset details from run records.
 *
 * Searches in-memory runs first, then persisted runs via Supabase.
 * Returns a canonical AssetDetail for UI inspection.
 */

import type { AssetDetail, AssetPreviewType, AssetFileDetail } from "./detail-types";
import type { Asset } from "./types";
import { getAssetDownloadInfo } from "./file-storage";
import { getAllRuns } from "../runs/store";
import { getRuns as getPersistedRuns } from "../state/adapter";

function inferPreviewType(assetType: string): AssetPreviewType {
  switch (assetType) {
    case "report":
      return "report";
    case "doc":
    case "text":
      return "document";
    case "json":
      return "json";
    default:
      return "unknown";
  }
}

function buildFileDetail(fullAsset?: Asset): AssetFileDetail | undefined {
  const file = fullAsset?.file;
  if (!file) return undefined;

  const info = getAssetDownloadInfo(file.filePath);

  return {
    hasFile: info.exists,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: info.sizeBytes ?? file.sizeBytes,
    downloadUrl: `/api/v2/assets/${fullAsset!.id}/download`,
  };
}

function assetToDetail(
  asset: { id: string; name: string; type: string },
  runId: string,
  fullAsset?: Asset,
): AssetDetail {
  const meta = fullAsset?.metadata as Record<string, unknown> | undefined;
  const content = (meta?.content as string) ?? undefined;

  let json: AssetDetail["json"];
  if (fullAsset?.type === "json" && content) {
    try {
      json = JSON.parse(content);
    } catch { /* not valid JSON */ }
  }

  return {
    id: asset.id,
    runId,
    tenantId: fullAsset?.tenantId,
    workspaceId: fullAsset?.workspaceId,
    name: asset.name,
    type: asset.type,
    previewType: inferPreviewType(asset.type),
    content,
    json,
    metadata: meta ? { ...meta, content: undefined } : undefined,
    file: buildFileDetail(fullAsset),
    createdAt: fullAsset?.created_at,
  };
}

function matchesRunScope(
  run: { userId?: string; tenantId?: string; workspaceId?: string },
  scope: { userId?: string; tenantId?: string; workspaceId?: string },
): boolean {
  if (scope.userId && run.userId !== scope.userId) return false;
  if (scope.tenantId && run.tenantId !== scope.tenantId) return false;
  if (scope.workspaceId && run.workspaceId !== scope.workspaceId) return false;
  return true;
}

export async function getAssetDetail(input: {
  assetId: string;
  tenantId?: string;
  workspaceId?: string;
  userId?: string;
}): Promise<AssetDetail | null> {
  // Search in-memory runs first (live data, has full Asset objects in events)
  const memRuns = getAllRuns(100);
  for (const run of memRuns) {
    if (!matchesRunScope(run, input)) continue;
    const assetRef = run.assets.find((a) => a.id === input.assetId);
    if (!assetRef) continue;

    // Try to find the full Asset from asset_generated events
    const assetEvent = run.events.find(
      (e) => e.type === "asset_generated" && "asset_id" in e && e.asset_id === input.assetId,
    );

    // Reconstruct a full asset from the event if available
    let fullAsset: Asset | undefined;
    if (assetEvent && "asset_type" in assetEvent) {
      fullAsset = {
        id: input.assetId,
        type: assetEvent.asset_type as Asset["type"],
        name: assetEvent.name as string,
        run_id: run.id,
        tenantId: run.tenantId,
        workspaceId: run.workspaceId,
        created_at: new Date(assetEvent.timestamp).getTime(),
      };
    }

    // Also check for content stored in the run's text_delta events
    if (!fullAsset?.metadata) {
      const textDeltas = run.events
        .filter((e) => e.type === "text_delta")
        .map((e) => ("delta" in e ? (e.delta as string) : ""))
        .join("");

      if (textDeltas && assetRef.type === "report") {
        fullAsset = fullAsset ?? {
          id: input.assetId,
          type: assetRef.type as Asset["type"],
          name: assetRef.name,
          run_id: run.id,
          tenantId: run.tenantId,
          workspaceId: run.workspaceId,
          created_at: Date.now(),
        };
        fullAsset.metadata = { content: textDeltas };
      }
    }

    // Check if file info is stored in metadata (from run-research-report)
    if (fullAsset?.metadata?._filePath && !fullAsset.file) {
      fullAsset.file = {
        storageKind: "file",
        fileName: (fullAsset.metadata._fileName as string) ?? `${assetRef.name}.md`,
        mimeType: (fullAsset.metadata._mimeType as string) ?? "text/markdown",
        filePath: fullAsset.metadata._filePath as string,
        sizeBytes: (fullAsset.metadata._sizeBytes as number) ?? 0,
      };
    }

    return assetToDetail(assetRef, run.id, fullAsset);
  }

  // Fall back to persisted runs (metadata only, no content unless stored)
  const persistedRuns = await getPersistedRuns({ userId: input.userId, limit: 100 });
  for (const run of persistedRuns) {
    if (!matchesRunScope(run, input)) continue;
    const assetRef = run.assets.find((a) => a.id === input.assetId);
    if (!assetRef) continue;

    // Reconstruct file info from persisted asset metadata if available
    const ref = assetRef as Record<string, unknown>;
    let fullAsset: Asset | undefined;
    if (ref._filePath) {
      fullAsset = {
        id: assetRef.id,
        type: assetRef.type as Asset["type"],
        name: assetRef.name,
        run_id: run.id,
        tenantId: run.tenantId,
        workspaceId: run.workspaceId,
        created_at: run.createdAt,
        file: {
          storageKind: "file",
          filePath: ref._filePath as string,
          fileName: (ref._fileName as string) ?? `${assetRef.name}.pdf`,
          mimeType: (ref._mimeType as string) ?? "application/pdf",
          sizeBytes: (ref._sizeBytes as number) ?? 0,
        },
      };
    }

    return assetToDetail(assetRef, run.id, fullAsset);
  }

  return null;
}
