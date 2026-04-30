-- Hearst OS — Renforcement RLS personas (defense in depth multi-tenant)
--
-- 0050 a créé des policies basées uniquement sur user_id = auth.uid().
-- C'est suffisant en pratique (chaque user n'appartient qu'à un tenant
-- principal côté UI), mais en defense in depth on veut aussi vérifier le
-- tenant_id du JWT pour qu'un token cross-tenant impersonifié ne puisse
-- jamais lire/écrire des personas d'un autre tenant.
--
-- Le claim `tenant_id` est posé par notre couche auth (cf.
-- lib/platform/auth/scope.ts) dans `app_metadata.tenant_id` ou directement
-- dans les claims JWT custom. On lit les deux emplacements pour rester
-- compatible avec le mode dev (claims top-level) et le mode prod
-- (app_metadata).

-- Helper local : extrait tenant_id depuis les claims, en testant les deux
-- emplacements. NULL-safe.
CREATE OR REPLACE FUNCTION public._jwt_tenant_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::json->>'tenant_id', ''),
    NULLIF(current_setting('request.jwt.claims', true)::json#>>'{app_metadata,tenant_id}', '')
  );
$$;

-- ── SELECT ─────────────────────────────────────────────────
DROP POLICY IF EXISTS personas_select_owner ON public.personas;
CREATE POLICY personas_select_owner ON public.personas
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    AND (
      public._jwt_tenant_id() IS NULL
      OR tenant_id = public._jwt_tenant_id()
    )
  );

-- ── INSERT ─────────────────────────────────────────────────
DROP POLICY IF EXISTS personas_insert_owner ON public.personas;
CREATE POLICY personas_insert_owner ON public.personas
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()::text
    AND (
      public._jwt_tenant_id() IS NULL
      OR tenant_id = public._jwt_tenant_id()
    )
  );

-- ── UPDATE ─────────────────────────────────────────────────
DROP POLICY IF EXISTS personas_update_owner ON public.personas;
CREATE POLICY personas_update_owner ON public.personas
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()::text
    AND (
      public._jwt_tenant_id() IS NULL
      OR tenant_id = public._jwt_tenant_id()
    )
  )
  WITH CHECK (
    user_id = auth.uid()::text
    AND (
      public._jwt_tenant_id() IS NULL
      OR tenant_id = public._jwt_tenant_id()
    )
  );

-- ── DELETE ─────────────────────────────────────────────────
DROP POLICY IF EXISTS personas_delete_owner ON public.personas;
CREATE POLICY personas_delete_owner ON public.personas
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()::text
    AND (
      public._jwt_tenant_id() IS NULL
      OR tenant_id = public._jwt_tenant_id()
    )
  );

-- service_role policy inchangée (bypass RLS pour les workers/serveurs).
