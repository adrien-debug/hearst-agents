-- Hearst OS — C7 Hospitality Vertical Pack
--
-- Stocke les paramètres par tenant : industry (hospitality | saas | ecommerce | general),
-- métadonnées libres. Permet à l'app de basculer en mode vertical et d'unlock
-- des features (reports specs, workflows, persona, briefing).
--
-- Le store applicatif (lib/verticals/hospitality/index.ts) gère un fallback
-- en mémoire si Supabase indisponible — la table reste optionnelle pour MVP.

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id text PRIMARY KEY,
  industry text NOT NULL DEFAULT 'general',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_settings_industry_idx ON tenant_settings (industry);

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_settings_select_member ON public.tenant_settings;
CREATE POLICY tenant_settings_select_member ON public.tenant_settings
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS tenant_settings_service_all ON public.tenant_settings;
CREATE POLICY tenant_settings_service_all ON public.tenant_settings
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
