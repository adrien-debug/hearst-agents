-- ============================================================
-- Hearst OS — Report Templates (specs réutilisables)
--
-- Permet de sauvegarder un ReportSpec modifié comme template
-- réutilisable au niveau tenant. Templates publics = visibles
-- par tous les tenants (plan sharing futur).
-- - tenant_id est text (cf provenance.tenantId pattern 0036/0037).
-- - created_by est uuid (auth.uid()) — aligné sur pattern user-scoped.
-- - spec est JSONB — revalidé via Zod au chargement côté applicatif.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.report_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   text NOT NULL,
  created_by  uuid NOT NULL,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  description text CHECK (description IS NULL OR length(description) <= 500),
  domain      text NOT NULL,
  spec        jsonb NOT NULL,
  is_public   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_templates_tenant   ON public.report_templates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_templates_domain   ON public.report_templates (domain);
CREATE INDEX IF NOT EXISTS idx_report_templates_creator  ON public.report_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_report_templates_public   ON public.report_templates (is_public) WHERE is_public = true;

-- ── RLS : isolation tenant + visibilité publique ─────────────
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

-- Lecture : son propre tenant OU template public
CREATE POLICY report_templates_select_user ON public.report_templates
  FOR SELECT TO authenticated
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')
    OR is_public = true
  );

-- Insert : uniquement dans son propre tenant
CREATE POLICY report_templates_insert_user ON public.report_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')
    AND created_by = auth.uid()
  );

-- Update : uniquement le créateur dans son tenant
CREATE POLICY report_templates_update_owner ON public.report_templates
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')
    AND created_by = auth.uid()
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')
    AND created_by = auth.uid()
  );

-- Delete : uniquement le créateur
CREATE POLICY report_templates_delete_owner ON public.report_templates
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- Service role bypass (admin / seeds)
CREATE POLICY report_templates_service_all ON public.report_templates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
