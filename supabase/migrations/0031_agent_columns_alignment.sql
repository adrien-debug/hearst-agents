-- ============================================================
-- Hearst OS — Restore legacy agent columns droppées hors-repo
--
-- Contexte :
--  La migration 0002_full_schema.sql créait `agent_skills` avec les
--  colonnes (priority int, config jsonb) et `agent_versions` avec
--  (system_prompt text, config_snapshot jsonb). Ces 4 colonnes ont été
--  supprimées côté Supabase hors-repo (probablement via dashboard ou
--  migration consolidée non poussée), pendant qu'un nouveau modèle
--  "container image registry" était introduit (image_ref, is_latest,
--  is_stable, published_at, config_schema).
--
--  Aucune migration dans le repo ne fait ce DROP. Aucun fichier code
--  applicatif n'utilise les nouvelles colonnes. Le code legacy
--  (chat/route, PUT agent, versions/route, replay engine, admin
--  dashboard) référence les anciennes → 4 erreurs TS qui bloquent
--  `npm run build` après regen lib/database.types.ts post-0030.
--
-- Cette migration restaure les 4 colonnes. Approche additive non
-- destructive — les nouvelles colonnes du modèle registry restent en
-- place, les deux sémantiques coexistent. Le replay engine a besoin
-- du freeze system_prompt + config_snapshot par version pour la
-- déterminisation, image_ref opaque ne fournit pas cette garantie.
--
-- Tables vérifiées à 0 rows avant apply → ALTER trivial, pas de
-- backfill nécessaire. UNIQUE INDEX (agent_id, skill_id) verrouille
-- l'invariant du code legacy (.order("priority") attend 1 row par
-- paire) ; si du versioning multi-row par paire émerge plus tard,
-- l'index sera droppé proprement.
--
-- TODO post-sprint : audit complet du schema drift Supabase ↔
-- migrations repo. Tables suspectes : agent_events, agent_runs_log,
-- creative_jobs, subscriptions, agent_tenant_configs,
-- 20260428190825_report_cache. À traiter dans une PR dédiée après
-- la sortie Phase B.
-- ============================================================

ALTER TABLE public.agent_skills
  ADD COLUMN IF NOT EXISTS priority int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS config   jsonb NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS agent_skills_unique_pair
  ON public.agent_skills (agent_id, skill_id);

ALTER TABLE public.agent_versions
  ADD COLUMN IF NOT EXISTS system_prompt   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS config_snapshot jsonb NOT NULL DEFAULT '{}';
