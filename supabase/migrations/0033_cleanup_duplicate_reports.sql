-- ============================================================
-- Hearst OS — Cleanup orphans + dédoublonnage rapports legacy
--
-- Contexte :
--  Avant le commit 3409af4, plusieurs call sites storeAsset() ne
--  passaient pas userId dans provenance (run-research-report.ts,
--  planner/pipeline.ts). Conséquence : 5+ rows assets orphelins
--  (provenance.userId IS NULL) qui passent les RLS user-scoped via
--  le fallback `OR IS NULL` mais polluent la liste utilisateur.
--
--  En plus, des duplications par (specId, userId) sont apparues —
--  un même rapport relancé créait un nouveau row au lieu de mettre
--  à jour le précédent. La tuile "Rapports" affichait alors 6 alors
--  qu'il y avait 2 specs distinctes runnées 3 fois chacune.
--
-- Cette migration :
--  1. DELETE des assets orphelins (provenance.userId NULL).
--  2. Dédoublonnage par (specId, userId) — garde le plus récent
--     (ORDER BY created_at DESC), DELETE les autres.
--  3. Cascade automatique sur asset_variants via FK ON DELETE CASCADE
--     (déclarée en migration 0029_asset_variants.sql).
--
-- ⚠️ Avant d'apply, run le DRYRUN
-- (0033_cleanup_duplicate_reports_DRYRUN.sql) pour voir le delta.
-- Idempotent : un re-run après apply retourne 0 row affectée.
-- ============================================================

BEGIN;

-- ── 1. DELETE orphelins (userId IS NULL) ───────────────────

DELETE FROM public.assets
 WHERE provenance->>'userId' IS NULL;

-- ── 2. Dédoublonnage par (specId, userId) ──────────────────
-- Pour chaque (specId, userId) avec plusieurs rows, garde uniquement
-- le plus récent (created_at DESC). Le dédoublonnage ignore les
-- rows sans specId (ces assets ne sont pas catalogués / ne se
-- dédoublonnent pas par essence — ex: chat artifacts ad hoc).

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY provenance->>'specId', provenance->>'userId'
           ORDER BY created_at DESC
         ) AS rn
    FROM public.assets
   WHERE provenance->>'specId' IS NOT NULL
)
DELETE FROM public.assets
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

COMMIT;
