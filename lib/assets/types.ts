/**
 * Asset & Action Model — Thread-scoped objects.
 *
 * Assets are produced deliverables (reports, sent messages, documents).
 * Actions are recorded operations (send, create, update).
 *
 * Both are stored per-thread and surface through the right panel
 * as focal objects — never as lists, tables, or file explorers.
 *
 * Anti-patterns:
 * - NO list/grid rendering of assets
 * - NO inbox or sent folder
 * - NO file explorer
 * - Assets surface through the Halo artifact system and right panel focal mode
 */

import type { ProviderId } from "@/lib/providers/types";
import type { HaloArtifactKind } from "@/app/lib/halo-state";
import type { OutputTier } from "@/lib/runtime/formatting/pipeline";

// ── Asset types ─────────────────────────────────────────────

export type AssetKind =
  | "report"
  | "brief"
  | "message"
  | "document"
  | "spreadsheet"
  | "task"
  | "event";

export interface AssetProvenance {
  providerId: ProviderId;
  channelRef?: string;
  sentAt?: number;
  deliveryStatus?: "sent" | "delivered" | "read" | "failed";
}

export interface Asset {
  id: string;
  threadId: string;
  kind: AssetKind;
  title: string;
  summary?: string;
  outputTier?: OutputTier;
  provenance: AssetProvenance;
  createdAt: number;
  /** Raw content or reference URL. */
  contentRef?: string;
  /** Associated run ID from orchestrator. */
  runId?: string;
}

// ── Action types ────────────────────────────────────────────

export type ActionType =
  | "message_sent"
  | "report_generated"
  | "document_created"
  | "task_created"
  | "event_created"
  | "file_uploaded";

export type ActionStatus = "pending" | "completed" | "failed";

export interface Action {
  id: string;
  threadId: string;
  type: ActionType;
  provider: ProviderId;
  status: ActionStatus;
  timestamp: number;
  metadata: Record<string, unknown>;
  /** Link to produced asset, if any. */
  assetId?: string;
}

// ── Thread-scoped store (in-memory, future: persistence) ────

const assetsByThread = new Map<string, Asset[]>();
const actionsByThread = new Map<string, Action[]>();

export function storeAsset(asset: Asset): void {
  const list = assetsByThread.get(asset.threadId) ?? [];
  list.push(asset);
  assetsByThread.set(asset.threadId, list);
}

export function getAssetsForThread(threadId: string): Asset[] {
  return assetsByThread.get(threadId) ?? [];
}

export function getLatestAssetForThread(threadId: string): Asset | null {
  const list = assetsByThread.get(threadId);
  return list && list.length > 0 ? list[list.length - 1] : null;
}

export function storeAction(action: Action): void {
  const list = actionsByThread.get(action.threadId) ?? [];
  list.push(action);
  actionsByThread.set(action.threadId, list);
}

export function getActionsForThread(threadId: string): Action[] {
  return actionsByThread.get(threadId) ?? [];
}

// ── Bridge: Asset → Halo artifact kind ──────────────────────

export function assetKindToHaloKind(kind: AssetKind): HaloArtifactKind {
  switch (kind) {
    case "report": return "report";
    case "brief": return "draft";
    case "message": return "draft";
    case "document": return "file";
    case "spreadsheet": return "file";
    case "task": return "task";
    case "event": return "event";
  }
}
