/**
 * @notYetWired
 * Canonical Data Export — creates a file-backed Asset from tabular data.
 * Not yet called from any runtime path. Available for future finance/analytics exports.
 *
 * Produces an xlsx (or honest csv fallback) and returns a normal Asset
 * compatible with the existing pipeline. Designed as the standard future
 * path for finance exports, analytics datasets, and table outputs.
 */

import { randomUUID } from "crypto";
import { createAsset } from "./create-asset";
import { generateSpreadsheetArtifact } from "./generators/spreadsheet";
import type { Asset } from "./types";

interface DataExportInput {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  runId: string;
  name: string;
  rows: Record<string, unknown>[];
  preferSpreadsheet?: boolean;
}

export async function createDataExportAsset(input: DataExportInput): Promise<Asset> {
  const assetId = randomUUID();

  const asset = createAsset({
    type: input.preferSpreadsheet !== false ? "excel" : "csv",
    name: input.name,
    run_id: input.runId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    metadata: {
      rows_count: input.rows.length,
      columns: Object.keys(input.rows[0] ?? {}),
      ...(input.userId ? { userId: input.userId } : {}),
    },
  });

  // Override auto-generated id so file and asset stay linked
  (asset as { id: string }).id = assetId;

  const fileInfo = await generateSpreadsheetArtifact({
    tenantId: input.tenantId,
    runId: input.runId,
    assetId,
    title: input.name,
    rows: input.rows,
  });

  asset.file = fileInfo;

  if (asset.metadata) {
    asset.metadata._filePath = fileInfo.filePath;
    asset.metadata._fileName = fileInfo.fileName;
    asset.metadata._mimeType = fileInfo.mimeType;
    asset.metadata._sizeBytes = fileInfo.sizeBytes;
  }

  // Update asset type to match actual generated format
  if (fileInfo.mimeType === "text/csv") {
    (asset as { type: string }).type = "csv";
  }

  console.log(
    `[DataExport] ${fileInfo.fileName} generated (${fileInfo.sizeBytes} bytes, ${input.rows.length} rows)`,
  );

  return asset;
}
