-- Hearst OS — C4 Brand Voice multi-persona
--
-- Stocke les variants de "voix" applicables aux runs LLM. Une persona =
-- un addon de system prompt + ton + vocabulaire + style guide. L'orchestrator
-- (`buildAgentSystemPrompt`) injecte l'addon dans la zone cacheable du prompt.
--
-- Scope strict user_id + tenant_id (multi-tenant) avec UNIQUE (user, tenant, name).
-- is_default : une seule persona par (user, tenant) peut être marquée default
-- — appliquée si aucun personaId explicite n'est fourni.

CREATE TABLE IF NOT EXISTS personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  tenant_id text NOT NULL,
  name text NOT NULL,
  description text,
  tone text,
  vocabulary jsonb,
  style_guide text,
  system_prompt_addon text,
  surface text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, name)
);

CREATE INDEX IF NOT EXISTS personas_user_tenant_idx ON personas (user_id, tenant_id);
CREATE INDEX IF NOT EXISTS personas_surface_idx ON personas (surface) WHERE surface IS NOT NULL;

ALTER TABLE personas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS personas_select_owner ON public.personas;
CREATE POLICY personas_select_owner ON public.personas
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS personas_insert_owner ON public.personas;
CREATE POLICY personas_insert_owner ON public.personas
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS personas_update_owner ON public.personas;
CREATE POLICY personas_update_owner ON public.personas
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS personas_delete_owner ON public.personas;
CREATE POLICY personas_delete_owner ON public.personas
  FOR DELETE TO authenticated
  USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS personas_service_all ON public.personas;
CREATE POLICY personas_service_all ON public.personas
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
