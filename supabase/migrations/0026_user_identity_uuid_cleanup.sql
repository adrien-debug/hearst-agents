-- ============================================================
-- Hearst OS — Cleanup user identity Email → UUID (Phase 3)
--
-- Contexte :
--  Avant le commit 5927427, NextAuth callback `jwt()` posait
--  `token.userId = profile.email`. Conséquence : 277 rows legacy en DB
--  ont un email comme `user_id text` au lieu de l'UUID public.users.id.
--
--  La migration 0028_rls_user_scoped.sql active des policies
--  `user_id = auth.uid()::text` qui filtrent par UUID. Sans backfill
--  préalable, ces rows email deviennent invisibles pour leur propriétaire.
--
-- Cette migration :
--  1. UPDATE chaque table user_id text — remplace email par UUID via
--     jointure sur public.users(email).
--  2. ALTER COLUMN user_id TYPE uuid (cast text → uuid).
--  3. UPDATE assets.provenance->>'userId' (jsonb_set) pour les rows
--     legacy (5 rows attendus selon audit Adrien).
--  4. Garde-fou défensif : RAISE EXCEPTION si des rows non résolus
--     restent (user_id qui n'est ni UUID ni email connu).
--
-- Tables couvertes (12 au total) :
--  Avec data à migrer (8) : runs, chat_messages, missions, audit_logs,
--    user_tokens, user_roles, artifacts, document_sessions
--  Vides — ALTER seulement (4) : agent_events, agent_runs_log,
--    creative_jobs, subscriptions
--
-- ⚠️ Avant d'apply cette migration, run le DRYRUN
-- (0026_user_identity_uuid_cleanup_DRYRUN.sql) pour voir le delta.
-- ============================================================

BEGIN;

-- ── 1. Tables avec data : UPDATE + ALTER ────────────────────

DO $$
DECLARE
  t text;
  unresolved int;
BEGIN
  -- Mêmes opérations sur chaque table user_id text → uuid.
  -- Order matters : runs avant chat_messages (FK references possible),
  -- mais ici toutes ces tables ont user_id en colonne plate sans FK.
  FOR t IN
    SELECT unnest(ARRAY[
      'runs',
      'chat_messages',
      'missions',
      'audit_logs',
      'user_tokens',
      'user_roles',
      'artifacts',
      'document_sessions'
    ])
  LOOP
    -- Backfill : remplace email par UUID via lookup public.users
    EXECUTE format(
      'UPDATE public.%I AS tbl
         SET user_id = u.id::text
        FROM public.users u
       WHERE tbl.user_id = u.email',
      t
    );

    -- Garde-fou : compte les rows avec user_id ni UUID ni email résolu
    EXECUTE format(
      'SELECT count(*) FROM public.%I
        WHERE user_id IS NOT NULL
          AND user_id !~ ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''',
      t
    ) INTO unresolved;

    IF unresolved > 0 THEN
      RAISE EXCEPTION
        'Migration 0026: % row(s) restant(s) dans %.user_id avec valeur ni UUID ni email connu — manuel requis avant ALTER COLUMN',
        unresolved, t;
    END IF;

    -- Cast text → uuid maintenant que toutes les rows sont UUID-formed
    EXECUTE format(
      'ALTER TABLE public.%I
         ALTER COLUMN user_id TYPE uuid USING user_id::uuid',
      t
    );

    RAISE NOTICE 'Migration 0026: % migrated to uuid', t;
  END LOOP;
END $$;

-- ── 2. Tables vides — ALTER COLUMN seulement ────────────────
-- Ces 4 tables existent en DB (créées hors-repo, vérifié à 0 rows) mais
-- pas dans les migrations versionnées. ALTER trivial sur table vide.

DO $$
DECLARE
  t text;
  rowcount int;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'agent_events',
      'agent_runs_log',
      'creative_jobs',
      'subscriptions'
    ])
  LOOP
    -- Skip silencieusement si la table n'existe pas (cas où l'inventaire
    -- diffère légèrement du brief Adrien) — la migration ne doit pas
    -- échouer pour une table absente.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Migration 0026: table % absente, skip', t;
      CONTINUE;
    END IF;

    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO rowcount;
    IF rowcount > 0 THEN
      RAISE EXCEPTION
        'Migration 0026: table % censée être vide mais contient % row(s) — review manuel requis',
        t, rowcount;
    END IF;

    -- Vérifie qu'il y a bien une colonne user_id text avant ALTER
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = t
         AND column_name = 'user_id' AND data_type = 'text'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN user_id TYPE uuid USING user_id::uuid',
        t
      );
      RAISE NOTICE 'Migration 0026: % (vide) altered to uuid', t;
    ELSE
      RAISE NOTICE 'Migration 0026: % pas de colonne user_id text, skip', t;
    END IF;
  END LOOP;
END $$;

-- ── 3. assets.provenance.userId — jsonb_set ─────────────────
-- 5 rows legacy attendus selon l'audit. La nouvelle écriture
-- (lib/engine/runtime/assets/adapter.ts) ne stocke plus userId dans
-- provenance, mais on nettoie quand même les anciennes données pour
-- que les RLS policies de 0028 fonctionnent.

UPDATE public.assets AS a
   SET provenance = jsonb_set(a.provenance, '{userId}', to_jsonb(u.id::text))
  FROM public.users u
 WHERE a.provenance->>'userId' = u.email;

-- Garde-fou : reste-t-il des rows avec un userId qui ne soit ni UUID
-- ni email connu ?
DO $$
DECLARE
  unresolved int;
BEGIN
  SELECT count(*) INTO unresolved
    FROM public.assets
   WHERE provenance ? 'userId'
     AND provenance->>'userId' IS NOT NULL
     AND provenance->>'userId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  IF unresolved > 0 THEN
    RAISE EXCEPTION
      'Migration 0026: % row(s) dans assets.provenance.userId avec valeur ni UUID ni email connu — manuel requis',
      unresolved;
  END IF;

  RAISE NOTICE 'Migration 0026: assets.provenance.userId nettoyé';
END $$;

COMMIT;
