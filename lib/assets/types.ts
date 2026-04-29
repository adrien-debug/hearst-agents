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
// Inlined from deleted halo-state.ts
type HaloArtifactKind = "report" | "draft" | "file" | "task" | "event";
import type { OutputTier } from "@/lib/engine/runtime/formatting/pipeline";

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
  tenantId?: string;
  workspaceId?: string;
  userId?: string;
  channelRef?: string;
  sentAt?: number;
  deliveryStatus?: "sent" | "delivered" | "read" | "failed";
  /** Si l'asset est issu d'un ReportSpec catalogué ou éphémère. */
  specId?: string;
  specVersion?: number;
  /** True quand l'asset est un rendu (run artifact) plutôt qu'un Spec persisté. */
  runArtifact?: boolean;
  /**
   * Type runtime original (pdf/excel/doc/json/csv/text) préservé au POST
   * `/api/v2/assets`. Le `kind` canonique (`document`, `spreadsheet`, etc.)
   * perd l'info au mapping ; ce champ permet à l'adapter (`mapKindToType`)
   * de retrouver la valeur exacte au round-trip.
   */
  type?: string;
  /**
   * Fichier binaire associé (PDF, Excel, etc.) — chemin storage + mime.
   * Utilisé par les research reports et toute capability qui produit un
   * artefact téléchargeable. Persisté ici plutôt que dans `contentRef`
   * pour que `/api/v2/assets/[id]/download` puisse l'atteindre sans
   * parser le contentRef.
   */
  pdfFile?: {
    storageKind: "inline" | "file";
    fileName: string;
    mimeType: string;
    filePath: string;
    sizeBytes: number;
  };
  /**
   * Signaux extraits du report. Persistés dans le provenance pour le
   * filtrage/listing côté UI sans avoir à reparser le contentRef.
   */
  reportMeta?: {
    signals?: Array<{ type: string; severity: string; message: string; blockId?: string }>;
    severity?: "info" | "warning" | "critical";
  };
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
  | "document_read"
  | "brief_generated"
  | "report_generated"
  | "message_sent"
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

// ── Persistent store (Supabase DB + in-memory cache) ────────

import { getServerSupabase } from "@/lib/platform/db/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rawDb(sb: ReturnType<typeof getServerSupabase>): SupabaseClient<any> | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sb as unknown as SupabaseClient<any> | null;
}

const assetCache = new Map<string, Asset[]>();
const actionCache = new Map<string, Action[]>();

/**
 * Remove an asset (by id) and its referencing actions from the in-memory
 * cache. Called by the DELETE API after the Supabase row is gone, so the
 * UI's fallback reads don't keep returning a row that no longer exists.
 */
export function evictAssetById(assetId: string): void {
  for (const [threadId, list] of assetCache.entries()) {
    const filtered = list.filter((a) => a.id !== assetId);
    if (filtered.length === list.length) continue;
    if (filtered.length === 0) assetCache.delete(threadId);
    else assetCache.set(threadId, filtered);
  }
  for (const [threadId, list] of actionCache.entries()) {
    const filtered = list.filter((a) => {
      const meta = (a.metadata ?? {}) as { assetId?: string };
      return meta.assetId !== assetId;
    });
    if (filtered.length !== list.length) {
      if (filtered.length === 0) actionCache.delete(threadId);
      else actionCache.set(threadId, filtered);
    }
  }
}

/** Wipe every cached asset and action across all threads. Server-only. */
export function clearAllAssetCaches(): void {
  assetCache.clear();
  actionCache.clear();
}

export async function storeAsset(asset: Asset): Promise<void> {
  // Reject assets without a meaningful title at the source rather than
  // letting them land in the DB and filtering them out everywhere downstream.
  // Avoids the previous "Untitled" rows that polluted the right-panel and
  // /assets list.
  const cleanTitle = (asset.title ?? "").trim();
  if (!cleanTitle || cleanTitle.toLowerCase() === "untitled") {
    console.warn(`[AssetStore] Refusing to persist asset ${asset.id} — empty or 'Untitled' title`);
    return;
  }

  // Garde-fou anti-orphelin : tout asset persisté doit avoir un userId
  // dans son provenance. Sans ça, l'asset passe les RLS user-scoped via
  // le fallback `OR IS NULL` mais perd la traçabilité. On warn plutôt
  // que reject pour ne pas casser des flows en cours pendant la migration —
  // post-cleanup user_identity, ce warn doit retourner zéro hit en logs.
  if (!asset.provenance?.userId) {
    console.warn(
      `[AssetStore] Asset ${asset.id} (${asset.kind}) has no provenance.userId — ` +
      `bug d'auth en amont, à fixer côté call site (run-research-report, planner, etc.).`,
    );
  }

  // In-memory cache (immédiat — visible avant le retour de la Promise)
  const list = assetCache.get(asset.threadId) ?? [];
  list.push(asset);
  assetCache.set(asset.threadId, list);

  // DB persistence — async pour permettre aux callers d'await la visibilité
  // DB avant d'enchaîner sur des INSERTs liés (ex: asset_variants FK). Les
  // callers historiques qui n'await pas conservent le comportement
  // fire-and-forget : la Promise est silencieusement dropped.
  const sb = getServerSupabase();
  if (!sb) return;

  const { error } = await rawDb(sb)!
    .from("assets")
    .upsert({
      id: asset.id,
      thread_id: asset.threadId,
      run_id: asset.runId ?? null,
      kind: asset.kind,
      title: cleanTitle,
      summary: asset.summary ?? null,
      content_ref: asset.contentRef ?? null,
      output_tier: asset.outputTier ?? null,
      provenance: asset.provenance as unknown as Record<string, unknown>,
      created_at: new Date(asset.createdAt).toISOString(),
    });

  if (error) {
    console.error("[AssetStore] DB write failed:", error.message);
  } else {
    console.log(`[AssetStore] persisted asset ${asset.id}`);
    // ── Webhook asset.created (fire-and-forget) ──────────────
    const tenantId = asset.provenance?.tenantId;
    if (tenantId) {
      import("@/lib/webhooks/dispatcher").then(({ dispatchWebhookEvent }) => {
        dispatchWebhookEvent("asset.created", tenantId, {
          assetId: asset.id,
          kind: asset.kind,
          title: cleanTitle,
        });
      }).catch(() => {});
    }
  }
}

/**
 * Sync accessor — returns cached assets only (for client-side hooks).
 * On the server, call loadAssetsForThread() first to hydrate from DB.
 */
export function getAssetsForThread(threadId: string): Asset[] {
  return assetCache.get(threadId) ?? [];
}

export function getLatestAssetForThread(threadId: string): Asset | null {
  const list = assetCache.get(threadId);
  return list && list.length > 0 ? list[list.length - 1] : null;
}

/**
 * Async loader — hydrates cache from Supabase. Call from server-side code.
 */
export async function loadAssetsForThread(threadId: string): Promise<Asset[]> {
  const cached = assetCache.get(threadId);
  if (cached && cached.length > 0) return cached;

  const sb = getServerSupabase();
  if (!sb) return [];

  const { data, error } = await rawDb(sb)!
    .from("assets")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error || !data) return [];

  const assets: Asset[] = data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    threadId: row.thread_id as string,
    kind: row.kind as AssetKind,
    title: row.title as string,
    summary: (row.summary as string | undefined) ?? undefined,
    outputTier: (row.output_tier as OutputTier | undefined) ?? undefined,
    provenance: (row.provenance ?? {}) as AssetProvenance,
    createdAt: new Date(row.created_at as string).getTime(),
    contentRef: (row.content_ref as string | undefined) ?? undefined,
    runId: (row.run_id as string | undefined) ?? undefined,
  }));

  assetCache.set(threadId, assets);
  return assets;
}

/**
 * Async loader — retourne les assets d'un scope (tenant + workspace), sans
 * filter par thread. Remplace `getAssets` de l'adapter runtime dans les
 * routes de listing (GET /api/v2/assets) pour éviter le double-modèle
 * RuntimeAsset ↔ Asset V2.
 *
 * Les assets issus des deux paths de création (catalog + research) sont
 * retournés ici en format V2 canonique, puisque les deux écrivent via
 * `storeAsset` depuis le 29/04/2026.
 */
export async function loadAssetsForScope({
  tenantId,
  workspaceId,
  userId,
  limit = 50,
}: {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  limit?: number;
}): Promise<Asset[]> {
  const sb = getServerSupabase();
  if (!sb) return [];

  const { data, error } = await rawDb(sb)!
    .from("assets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as Record<string, unknown>[])
    .map((row): Asset => ({
      id: row.id as string,
      threadId: (row.thread_id as string) ?? "default",
      kind: row.kind as AssetKind,
      title: (row.title as string) ?? "Untitled",
      summary: (row.summary as string | undefined) ?? undefined,
      outputTier: (row.output_tier as OutputTier | undefined) ?? undefined,
      provenance: (row.provenance ?? {}) as AssetProvenance,
      createdAt: new Date(row.created_at as string).getTime(),
      contentRef: (row.content_ref as string | undefined) ?? undefined,
      runId: (row.run_id as string | undefined) ?? undefined,
    }))
    .filter((asset) => {
      const prov = asset.provenance;
      if (prov.tenantId && prov.tenantId !== tenantId) return false;
      if (prov.workspaceId && prov.workspaceId !== workspaceId) return false;
      if (userId) {
        const owner = prov.userId;
        if (owner && owner !== userId) return false;
      }
      return true;
    });
}

/** Charge un seul Asset V2 par ID depuis Supabase. Vérifie le scope tenant. */
export async function loadAssetById(
  id: string,
  scope?: { tenantId?: string; workspaceId?: string },
): Promise<Asset | null> {
  const sb = getServerSupabase();
  if (!sb) return null;

  const { data, error } = await rawDb(sb)!
    .from("assets")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  const prov = (row.provenance ?? {}) as AssetProvenance;

  if (scope?.tenantId && prov.tenantId && prov.tenantId !== scope.tenantId) return null;
  if (scope?.workspaceId && prov.workspaceId && prov.workspaceId !== scope.workspaceId) return null;

  return {
    id: row.id as string,
    threadId: (row.thread_id as string) ?? "default",
    kind: row.kind as AssetKind,
    title: (row.title as string) ?? "Untitled",
    summary: (row.summary as string | undefined) ?? undefined,
    outputTier: (row.output_tier as OutputTier | undefined) ?? undefined,
    provenance: prov,
    createdAt: new Date(row.created_at as string).getTime(),
    contentRef: (row.content_ref as string | undefined) ?? undefined,
    runId: (row.run_id as string | undefined) ?? undefined,
  };
}

export function storeAction(action: Action): void {
  const list = actionCache.get(action.threadId) ?? [];
  list.push(action);
  actionCache.set(action.threadId, list);

  const sb = getServerSupabase();
  if (sb) {
    rawDb(sb)!.from("actions")
      .upsert({
        id: action.id,
        thread_id: action.threadId,
        type: action.type,
        provider: action.provider,
        status: action.status,
        timestamp: new Date(action.timestamp).toISOString(),
        metadata: action.metadata as unknown as Record<string, unknown>,
        asset_id: action.assetId ?? null,
      })
      .then(({ error }) => {
        if (error) console.error("[ActionStore] DB write failed:", error.message);
      });
  }
}

export function getActionsForThread(threadId: string): Action[] {
  return actionCache.get(threadId) ?? [];
}

export async function loadActionsForThread(threadId: string): Promise<Action[]> {
  const cached = actionCache.get(threadId);
  if (cached && cached.length > 0) return cached;

  const sb = getServerSupabase();
  if (!sb) return [];

  const { data, error } = await rawDb(sb)!
    .from("actions")
    .select("*")
    .eq("thread_id", threadId)
    .order("timestamp", { ascending: true })
    .limit(50);

  if (error || !data) return [];

  const actions: Action[] = data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    threadId: row.thread_id as string,
    type: row.type as ActionType,
    provider: row.provider as ProviderId,
    status: row.status as ActionStatus,
    timestamp: new Date(row.timestamp as string).getTime(),
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    assetId: (row.asset_id as string | undefined) ?? undefined,
  }));

  actionCache.set(threadId, actions);
  return actions;
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
