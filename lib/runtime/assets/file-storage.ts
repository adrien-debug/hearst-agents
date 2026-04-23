/**
 * Asset File Storage — simple local filesystem storage for generated artifacts.
 *
 * Files are stored under `.runtime-assets/<tenantId>/<runId>/<fileName>`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join, resolve } from "path";
import type { AssetFileInfo } from "./types";

const STORAGE_ROOT = resolve(process.cwd(), ".runtime-assets");

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function assetDir(tenantId: string, runId: string): string {
  return join(STORAGE_ROOT, tenantId, runId);
}

export interface SaveFileInput {
  tenantId: string;
  runId: string;
  assetId: string;
  fileName: string;
  mimeType: string;
  content: string | Buffer;
}

export function saveAssetFile(input: SaveFileInput): AssetFileInfo {
  const dir = assetDir(input.tenantId, input.runId);
  ensureDir(dir);

  const filePath = join(dir, input.fileName);
  const data = typeof input.content === "string" ? Buffer.from(input.content, "utf-8") : input.content;

  writeFileSync(filePath, data);

  return {
    storageKind: "file",
    fileName: input.fileName,
    mimeType: input.mimeType,
    filePath,
    sizeBytes: data.length,
  };
}

export function readAssetFile(filePath: string): Buffer | null {
  try {
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath);
  } catch {
    return null;
  }
}

export function getAssetDownloadInfo(filePath: string): {
  exists: boolean;
  sizeBytes?: number;
} {
  try {
    if (!existsSync(filePath)) return { exists: false };
    const stat = statSync(filePath);
    return { exists: true, sizeBytes: stat.size };
  } catch {
    return { exists: false };
  }
}
