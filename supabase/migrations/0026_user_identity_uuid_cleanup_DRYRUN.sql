-- ============================================================
-- DRY-RUN — Audit AVANT d'appliquer 0026_user_identity_uuid_cleanup.sql
--
-- ⚠️ Ce fichier n'est PAS une migration. Ne pas l'apply via supabase
-- migration up. Run-le manuellement dans le SQL Editor du dashboard
-- pour voir le delta attendu : combien de rows seront migrées par
-- table, et combien sont non-résolvables (devront être traitées
-- manuellement avant l'ALTER COLUMN).
--
-- Si la sortie montre 0 row "non résolvable" sur toutes les tables et
-- les volumes correspondent à ce qu'Adrien a annoncé (218 chat_messages,
-- 52 runs, 5 assets, 0 sur les 4 tables vides), tu peux apply 0026.
-- Sinon, traiter les exceptions à la main.
-- ============================================================

-- ── Section 1 : Volumes par table à migrer ──────────────────

WITH counts AS (
  SELECT 'runs' AS tbl, count(*) AS total,
         count(*) FILTER (WHERE user_id IS NULL) AS null_uid,
         count(*) FILTER (WHERE user_id ~ '@') AS email_uid,
         count(*) FILTER (WHERE user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS uuid_uid,
         count(*) FILTER (WHERE user_id IS NOT NULL AND user_id !~ '@' AND user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}') AS other_uid
    FROM public.runs
  UNION ALL
  SELECT 'chat_messages', count(*),
         count(*) FILTER (WHERE user_id IS NULL),
         count(*) FILTER (WHERE user_id ~ '@'),
         count(*) FILTER (WHERE user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
         count(*) FILTER (WHERE user_id IS NOT NULL AND user_id !~ '@' AND user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}')
    FROM public.chat_messages
  UNION ALL
  SELECT 'missions', count(*),
         count(*) FILTER (WHERE user_id IS NULL),
         count(*) FILTER (WHERE user_id ~ '@'),
         count(*) FILTER (WHERE user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
         count(*) FILTER (WHERE user_id IS NOT NULL AND user_id !~ '@' AND user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}')
    FROM public.missions
  UNION ALL
  SELECT 'audit_logs', count(*),
         count(*) FILTER (WHERE user_id IS NULL),
         count(*) FILTER (WHERE user_id ~ '@'),
         count(*) FILTER (WHERE user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
         count(*) FILTER (WHERE user_id IS NOT NULL AND user_id !~ '@' AND user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}')
    FROM public.audit_logs
  UNION ALL
  SELECT 'user_tokens', count(*),
         count(*) FILTER (WHERE user_id IS NULL),
         count(*) FILTER (WHERE user_id ~ '@'),
         count(*) FILTER (WHERE user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
         count(*) FILTER (WHERE user_id IS NOT NULL AND user_id !~ '@' AND user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}')
    FROM public.user_tokens
  UNION ALL
  SELECT 'user_roles', count(*),
         count(*) FILTER (WHERE user_id IS NULL),
         count(*) FILTER (WHERE user_id ~ '@'),
         count(*) FILTER (WHERE user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
         count(*) FILTER (WHERE user_id IS NOT NULL AND user_id !~ '@' AND user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}')
    FROM public.user_roles
  UNION ALL
  SELECT 'artifacts', count(*),
         count(*) FILTER (WHERE user_id IS NULL),
         count(*) FILTER (WHERE user_id ~ '@'),
         count(*) FILTER (WHERE user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
         count(*) FILTER (WHERE user_id IS NOT NULL AND user_id !~ '@' AND user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}')
    FROM public.artifacts
  UNION ALL
  SELECT 'document_sessions', count(*),
         count(*) FILTER (WHERE user_id IS NULL),
         count(*) FILTER (WHERE user_id ~ '@'),
         count(*) FILTER (WHERE user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
         count(*) FILTER (WHERE user_id IS NOT NULL AND user_id !~ '@' AND user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}')
    FROM public.document_sessions
)
SELECT tbl AS table_name,
       total,
       null_uid AS null_count,
       email_uid AS email_to_migrate,
       uuid_uid AS already_uuid,
       other_uid AS unresolvable_other
  FROM counts
 ORDER BY tbl;

-- ── Section 2 : Tables vides (les 4 fantômes) ────────────────

SELECT
  table_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND tables.table_name = t.table_name
    ) THEN 'exists'
    ELSE 'missing'
  END AS status,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND tables.table_name = t.table_name
    ) THEN (
      SELECT count(*)::text FROM public.agent_events
       WHERE t.table_name = 'agent_events'
    )
    ELSE 'n/a'
  END AS rowcount_if_exists
FROM (VALUES
  ('agent_events'),
  ('agent_runs_log'),
  ('creative_jobs'),
  ('subscriptions')
) AS t(table_name);

-- ── Section 3 : assets.provenance.userId ────────────────────

SELECT
  count(*) AS total_assets_with_userid,
  count(*) FILTER (WHERE provenance->>'userId' ~ '@') AS email_provenance,
  count(*) FILTER (WHERE provenance->>'userId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS uuid_provenance,
  count(*) FILTER (WHERE provenance ? 'userId' AND provenance->>'userId' IS NOT NULL AND provenance->>'userId' !~ '@' AND provenance->>'userId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}') AS unresolvable_provenance
  FROM public.assets
 WHERE provenance ? 'userId';

-- ── Section 4 : Couverture mapping email → UUID (public.users) ──

-- Liste les emails distincts qui apparaissent dans user_id text mais
-- ne sont pas connus dans public.users. Ces rows échoueront le UPDATE
-- du backfill et resteront en email post-migration → ALTER échouera.
-- À traiter à la main : soit créer le row public.users manuellement,
-- soit DELETE / nullifier ces rows orphelines.

WITH all_emails AS (
  SELECT DISTINCT user_id AS email FROM public.runs WHERE user_id ~ '@'
  UNION SELECT DISTINCT user_id FROM public.chat_messages WHERE user_id ~ '@'
  UNION SELECT DISTINCT user_id FROM public.missions WHERE user_id ~ '@'
  UNION SELECT DISTINCT user_id FROM public.audit_logs WHERE user_id ~ '@'
  UNION SELECT DISTINCT user_id FROM public.user_tokens WHERE user_id ~ '@'
  UNION SELECT DISTINCT user_id FROM public.user_roles WHERE user_id ~ '@'
  UNION SELECT DISTINCT user_id FROM public.artifacts WHERE user_id ~ '@'
  UNION SELECT DISTINCT user_id FROM public.document_sessions WHERE user_id ~ '@'
)
SELECT a.email,
       CASE WHEN u.id IS NULL THEN '⚠️ ORPHELIN (à traiter manuellement)' ELSE '✓ mappable' END AS status,
       u.id AS mapped_uuid
  FROM all_emails a
  LEFT JOIN public.users u ON u.email = a.email
 ORDER BY (u.id IS NULL) DESC, a.email;
