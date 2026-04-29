-- ============================================================
-- Hearst OS — RLS user-scoped pour runs et assets/actions
--
-- Contexte :
--  - migration 0003 active RLS sur `runs` mais avec policies USING(true)
--    → tout user authentifié peut lire les runs de tous les tenants.
--  - migration 0017 n'a PAS activé RLS sur `assets` ni `actions`
--    → données accessibles sans scoping côté Postgres.
--  - migration 0026 (préalable) a typé runs.user_id en uuid. Donc on
--    compare `user_id = auth.uid()` (uuid native), plus de cast ::text.
--
-- Cette migration :
--  1. Drop les policies trop permissives sur runs.
--  2. Active RLS sur assets et actions.
--  3. Crée des policies user-scoped :
--     - runs.user_id : uuid → comparaison `auth.uid()` directe
--     - assets.provenance->>'userId' : jsonb extract → text → cast ::text
--       sur auth.uid() (jsonb extract retourne text)
--     - actions : jointure sur assets (idem cast ::text)
--  4. Ajoute un index GIN sur provenance jsonb pour les perfs.
-- ============================================================

-- ── 1. Runs — replace USING(true) with user_id scoping ─────

DROP POLICY IF EXISTS runs_select_auth ON public.runs;
DROP POLICY IF EXISTS runs_insert_auth ON public.runs;
DROP POLICY IF EXISTS runs_update_auth ON public.runs;
DROP POLICY IF EXISTS runs_delete_auth ON public.runs;

-- runs.user_id est typé uuid post-0026 → comparaison native sans cast.
CREATE POLICY runs_select_user ON public.runs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY runs_insert_user ON public.runs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY runs_update_user ON public.runs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY runs_delete_user ON public.runs
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);

-- Service role bypass (server writes go through service_role key)
CREATE POLICY runs_service_all ON public.runs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 2. Assets — enable RLS + user-scoped policies ──────────

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY assets_select_user ON public.assets
  FOR SELECT TO authenticated
  USING (
    (provenance->>'userId') = auth.uid()::text
    OR (provenance->>'userId') IS NULL
  );

CREATE POLICY assets_insert_user ON public.assets
  FOR INSERT TO authenticated
  WITH CHECK (
    (provenance->>'userId') = auth.uid()::text
    OR (provenance->>'userId') IS NULL
  );

CREATE POLICY assets_update_user ON public.assets
  FOR UPDATE TO authenticated
  USING (
    (provenance->>'userId') = auth.uid()::text
    OR (provenance->>'userId') IS NULL
  )
  WITH CHECK (
    (provenance->>'userId') = auth.uid()::text
    OR (provenance->>'userId') IS NULL
  );

CREATE POLICY assets_delete_user ON public.assets
  FOR DELETE TO authenticated
  USING (
    (provenance->>'userId') = auth.uid()::text
    OR (provenance->>'userId') IS NULL
  );

CREATE POLICY assets_service_all ON public.assets
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Index GIN sur provenance jsonb (perfs filtres user_id, tenant_id)
CREATE INDEX IF NOT EXISTS idx_assets_provenance_gin
  ON public.assets USING GIN (provenance);

-- ── 3. Actions — enable RLS + thread-scoped policies ───────
-- Actions n'ont pas de user_id direct ; on autorise via la jointure
-- sur assets (un user voit ses actions si elles touchent ses assets)
-- ou via le thread_id qui appartient à son own conversation.

ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY actions_select_user ON public.actions
  FOR SELECT TO authenticated
  USING (
    asset_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = public.actions.asset_id
        AND ((a.provenance->>'userId') = auth.uid()::text
          OR (a.provenance->>'userId') IS NULL)
    )
  );

CREATE POLICY actions_insert_user ON public.actions
  FOR INSERT TO authenticated
  WITH CHECK (
    asset_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = public.actions.asset_id
        AND ((a.provenance->>'userId') = auth.uid()::text
          OR (a.provenance->>'userId') IS NULL)
    )
  );

CREATE POLICY actions_service_all ON public.actions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 4. Run_steps / run_logs / artifacts — keep auth USING(true) ────
-- Ces tables ont déjà RLS via migration 0015. Pour cette première
-- passe, on les laisse permissives (l'accès passe par les routes API
-- qui filtrent via run_id côté code). Tightening prévu en migration
-- séparée quand le runs.user_id sera systématiquement renseigné.
