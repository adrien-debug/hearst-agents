/**
 * Asset → embedding hook.
 *
 * Surface neutre pour brancher l'auto-ingest des assets dans la table
 * `embeddings` SANS toucher `lib/assets/types.ts` (réservé Agent 1 B4).
 *
 * Deux entrées :
 * - `embedAssetSummary({ asset })` : appelable depuis l'extérieur (tool
 *   create_artifact, observer asset, n'importe quel callsite qui sait
 *   construire un Asset minimal).
 * - `fireAndForgetEmbedAsset(...)` : wrapper void, pose la promesse en
 *   background, ne throw jamais.
 *
 * Le source_id utilisé est `asset.id` ; le source_kind est `"asset"`.
 * Le texte embedded est `title + " — " + summary` (cap 1200 chars).
 */

import { upsertEmbedding } from "./store";

/**
 * Forme minimale d'un Asset attendue. On ne dépend PAS de
 * `@/lib/assets/types` pour rester découplé d'Agent 1 B4 — le contrat
 * est volontairement plus large que celui d'Asset (plus de champs ne
 * casse rien).
 */
export interface EmbeddableAsset {
  id: string;
  title?: string | null;
  summary?: string | null;
  contentRef?: string | null;
  provenance?: {
    userId?: string | null;
    tenantId?: string | null;
  } | null;
}

const TITLE_MAX = 200;
const SUMMARY_MAX = 1000;

function buildExcerpt(asset: EmbeddableAsset): string {
  const title = (asset.title ?? "").trim().slice(0, TITLE_MAX);
  const summary = (asset.summary ?? "").trim().slice(0, SUMMARY_MAX);
  const fallbackBody = !summary && asset.contentRef
    ? asset.contentRef.trim().slice(0, SUMMARY_MAX)
    : "";
  const body = summary || fallbackBody;
  if (title && body) return `${title} — ${body}`;
  return title || body;
}

export interface EmbedAssetSummaryInput {
  asset: EmbeddableAsset;
  /** Override scope si la provenance asset n'est pas fiable. */
  userId?: string;
  tenantId?: string;
}

/**
 * Embed un asset pour la mémoire LTM. Retourne true si écrit, false
 * fail-soft. Ne throw jamais sauf bug d'API JS interne.
 */
export async function embedAssetSummary(
  input: EmbedAssetSummaryInput,
): Promise<boolean> {
  const { asset } = input;
  if (!asset?.id) return false;

  const userId = input.userId ?? asset.provenance?.userId ?? "";
  const tenantId = input.tenantId ?? asset.provenance?.tenantId ?? "";
  if (!userId || !tenantId) {
    console.warn(
      "[asset-hook] missing user/tenant scope on asset",
      asset.id,
    );
    return false;
  }

  const excerpt = buildExcerpt(asset);
  if (!excerpt) return false;

  return upsertEmbedding({
    userId,
    tenantId,
    sourceKind: "asset",
    sourceId: asset.id,
    textExcerpt: excerpt,
    metadata: {
      title: asset.title ?? null,
    },
  });
}

/** Fire-and-forget : à utiliser depuis le tool create_artifact / pipeline. */
export function fireAndForgetEmbedAsset(input: EmbedAssetSummaryInput): void {
  void embedAssetSummary(input).catch((err) => {
    console.warn("[asset-hook] embedAssetSummary error:", err);
  });
}
