/**
 * Browser Co-Pilot — Screenshot capture (B5).
 *
 * Capture l'état courant d'une session Browserbase et persiste l'image
 * comme asset (kind metadata = "screenshot"). Utilisé par :
 *  - POST /api/v2/browser/[id]/capture (bouton manuel)
 *  - L'executor Stagehand pour annoter chaque action
 *
 * Implémentation : tente l'endpoint Browserbase officiel
 * `GET /v1/sessions/:id/recording` + downscale est trop lourd ; on tape
 * directement l'endpoint screenshot v1 (`GET /v1/sessions/:id/screenshot`)
 * qui renvoie une image PNG du viewport courant. Fail-soft : si la session
 * est morte ou l'endpoint indispo, on retourne un error code propre que
 * l'API peut mapper en 502.
 */

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { getGlobalStorage } from "@/lib/engine/runtime/assets/storage";
import {
  createAsset,
  storeAsset,
} from "@/lib/engine/runtime/assets/create-asset";
import type { Asset } from "@/lib/engine/runtime/assets/types";

const BB_API_BASE = "https://www.browserbase.com/v1";

interface CaptureScope {
  userId: string;
  tenantId: string;
  workspaceId: string;
}

export interface CaptureResult {
  asset: Asset;
  url: string;
  sizeBytes: number;
  mimeType: "image/png";
}

function getApiKey(): string {
  const key = process.env.BROWSERBASE_API_KEY;
  if (!key) throw new Error("Browserbase non configuré");
  return key;
}

/**
 * Récupère un screenshot PNG de la session via l'API Browserbase.
 * Lève sur erreur réseau / status >= 400.
 */
export async function fetchSessionScreenshot(
  sessionId: string,
): Promise<Buffer> {
  const res = await fetch(
    `${BB_API_BASE}/sessions/${encodeURIComponent(sessionId)}/screenshot`,
    {
      method: "GET",
      headers: { "X-BB-API-Key": getApiKey() },
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `[Browserbase] screenshot status=${res.status} message=${body.slice(0, 200)}`,
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) {
    throw new Error("[Browserbase] screenshot vide");
  }
  return buf;
}

/**
 * Capture + persiste comme asset (storageKind: file). Retourne l'asset
 * complet + l'URL publique servie par le storage provider.
 */
export async function captureScreenshot(
  sessionId: string,
  scope: CaptureScope,
  opts?: {
    /** Override pour les tests : skip le fetch réel et utilise ce buffer. */
    bufferOverride?: Buffer;
    /** Run/session-id logique pour la provenance. */
    runId?: string;
  },
): Promise<CaptureResult> {
  const buf = opts?.bufferOverride ?? (await fetchSessionScreenshot(sessionId));
  const storage = getGlobalStorage();
  const assetId = randomUUID();
  const storageKey = `browser-captures/${sessionId}/${assetId}.png`;

  const upload = await storage.upload(storageKey, buf, {
    contentType: "image/png",
    tenantId: scope.tenantId,
    metadata: {
      userId: scope.userId,
      sessionId,
      kind: "screenshot",
    },
  });

  const asset = createAsset({
    type: "report",
    name: `Screenshot ${sessionId.slice(0, 8)} ${new Date().toLocaleTimeString("fr-FR")}`,
    run_id: opts?.runId ?? sessionId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    url: upload.url,
    metadata: {
      kind: "screenshot",
      sessionId,
      sizeBytes: upload.size,
      mimeType: "image/png",
      capturedAt: new Date().toISOString(),
      userId: scope.userId,
    },
  });
  asset.id = assetId;
  asset.file = {
    storageKind: "file",
    fileName: `${assetId}.png`,
    mimeType: "image/png",
    filePath: storageKey,
    sizeBytes: upload.size,
  };
  asset.userId = scope.userId;
  storeAsset(asset);

  return {
    asset,
    url: upload.url,
    sizeBytes: upload.size,
    mimeType: "image/png",
  };
}

/**
 * Persiste une extraction structurée comme asset JSON (kind: "extract").
 */
export async function persistExtraction(
  sessionId: string,
  data: unknown,
  scope: CaptureScope,
  meta: { instruction: string; schema?: Record<string, unknown> },
): Promise<Asset> {
  const asset = createAsset({
    type: "json",
    name: `Extract ${sessionId.slice(0, 8)} ${new Date().toLocaleTimeString("fr-FR")}`,
    run_id: sessionId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    metadata: {
      kind: "extract",
      sessionId,
      instruction: meta.instruction,
      schema: meta.schema ?? null,
      data,
      capturedAt: new Date().toISOString(),
      userId: scope.userId,
    },
  });
  asset.userId = scope.userId;
  storeAsset(asset);
  return asset;
}

/**
 * Persiste un mini-rapport de session (kind: "browser_session_report").
 */
export async function persistSessionReport(
  sessionId: string,
  scope: CaptureScope,
  report: {
    summary: string;
    totalActions: number;
    totalDurationMs: number;
    assetIds: string[];
  },
): Promise<Asset> {
  const asset = createAsset({
    type: "report",
    name: `Browser session report ${sessionId.slice(0, 8)}`,
    run_id: sessionId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    metadata: {
      kind: "browser_session_report",
      sessionId,
      ...report,
      generatedAt: new Date().toISOString(),
      userId: scope.userId,
    },
  });
  asset.userId = scope.userId;
  storeAsset(asset);
  return asset;
}
