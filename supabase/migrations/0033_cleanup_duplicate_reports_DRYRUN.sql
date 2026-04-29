-- ============================================================
-- DRY-RUN — Audit AVANT d'apply 0033_cleanup_duplicate_reports.sql
--
-- ⚠️ Ce fichier n'est PAS une migration. Run dans le SQL Editor du
-- dashboard pour voir combien de rows vont disparaître. Si les volumes
-- sont conformes à l'attente, apply la vraie migration.
-- ============================================================

-- ── Section 1 : Volumes globaux ─────────────────────────────

SELECT
  count(*) AS total_assets,
  count(*) FILTER (WHERE provenance->>'userId' IS NULL) AS orphans_to_delete,
  count(*) FILTER (WHERE provenance->>'userId' IS NOT NULL) AS attributable_assets,
  count(*) FILTER (WHERE provenance->>'specId' IS NOT NULL) AS reports_with_spec_id,
  count(DISTINCT (provenance->>'specId', provenance->>'userId'))
    FILTER (WHERE provenance->>'specId' IS NOT NULL) AS unique_spec_user_pairs
  FROM public.assets;

-- ── Section 2 : Détail des orphelins (userId NULL) ──────────

SELECT id, kind, title,
       provenance->>'specId'    AS spec_id,
       provenance->>'tenantId'  AS tenant_id,
       created_at
  FROM public.assets
 WHERE provenance->>'userId' IS NULL
 ORDER BY created_at DESC
 LIMIT 20;

-- ── Section 3 : Doublons par (specId, userId) ──────────────
-- Liste les paires avec >1 row, et combien de rows seront supprimées.

WITH ranked AS (
  SELECT id, title,
         provenance->>'specId' AS spec_id,
         provenance->>'userId' AS user_id,
         created_at,
         ROW_NUMBER() OVER (
           PARTITION BY provenance->>'specId', provenance->>'userId'
           ORDER BY created_at DESC
         ) AS rn
    FROM public.assets
   WHERE provenance->>'specId' IS NOT NULL
)
SELECT spec_id,
       user_id,
       count(*) AS total_rows,
       count(*) FILTER (WHERE rn = 1) AS keepers,
       count(*) FILTER (WHERE rn > 1) AS to_delete,
       max(created_at) FILTER (WHERE rn = 1) AS latest_kept_at
  FROM ranked
 GROUP BY spec_id, user_id
HAVING count(*) > 1
 ORDER BY count(*) DESC, latest_kept_at DESC;

-- ── Section 4 : Cascade sur asset_variants ─────────────────
-- Combien de variants seront supprimés en cascade (FK ON DELETE CASCADE).

SELECT count(*) AS variants_cascaded
  FROM public.asset_variants v
  JOIN public.assets a ON a.id = v.asset_id
 WHERE a.provenance->>'userId' IS NULL
    OR a.id IN (
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY provenance->>'specId', provenance->>'userId'
          ORDER BY created_at DESC
        ) AS rn
        FROM public.assets
        WHERE provenance->>'specId' IS NOT NULL
      )
      SELECT id FROM ranked WHERE rn > 1
    );

-- ── Section 5 : Sanity post-migration (à run APRÈS apply) ──
-- Toutes ces queries doivent retourner 0 après apply, ou la même
-- valeur (idempotence).

-- 0 orphelin attendu
SELECT count(*) AS still_orphans
  FROM public.assets
 WHERE provenance->>'userId' IS NULL;

-- 1 row par paire (specId, userId) attendu
SELECT spec_id, user_id, count(*)
  FROM (
    SELECT provenance->>'specId' AS spec_id,
           provenance->>'userId' AS user_id
      FROM public.assets
     WHERE provenance->>'specId' IS NOT NULL
  ) sub
 GROUP BY spec_id, user_id
HAVING count(*) > 1;
