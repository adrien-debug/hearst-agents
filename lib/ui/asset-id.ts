/**
 * Helper de validation d'assetId côté UI.
 *
 * `setStageMode({ mode: "asset", assetId })` doit pointer vers un asset
 * réellement persisté en DB, sinon AssetStage tombe en error et
 * AssetVariantTabs poll en boucle dans le vide.
 *
 * Cas écartés :
 *  - null / undefined / chaîne vide ou whitespace
 *  - UUIDs fixtures de catalogue/test (préfixe `00000000-0000-4000-8000-`)
 *    qui sont des `specId` (lib/reports/catalog/*) ou des assets mockés
 *    dans les e2e — jamais des assets réellement persistés.
 */

const FIXTURE_PREFIX = "00000000-0000-4000-8000-";

export function isPlaceholderAssetId(
  assetId: string | null | undefined,
): boolean {
  if (!assetId) return true;
  const trimmed = assetId.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith(FIXTURE_PREFIX)) return true;
  return false;
}
