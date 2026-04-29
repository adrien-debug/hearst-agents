-- ============================================================
-- Hearst OS — Report Versions (historique immuable, append-only)
--
-- Stocke un snapshot complet de chaque run de rapport :
-- spec, payload rendu, signaux, narration.
-- Aucune suppression possible — historique append-only.
-- Le version_number est auto-incrémenté par asset_id (côté code).
-- tenant_id est text (aligné sur le pattern existant assets/shares/comments).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.report_versions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id           text        NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  tenant_id          text        NOT NULL,
  version_number     integer     NOT NULL,
  spec_snapshot      jsonb       NOT NULL,
  render_snapshot    jsonb       NOT NULL,
  signals_snapshot   jsonb,
  narration_snapshot text,
  triggered_by       text        NOT NULL DEFAULT 'manual'
                                 CHECK (triggered_by IN ('manual', 'scheduled', 'api')),
  created_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE (asset_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_report_versions_asset_version
  ON public.report_versions (asset_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_report_versions_tenant
  ON public.report_versions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_report_versions_created
  ON public.report_versions (created_at DESC);

-- RLS : aligné sur 0036/0037. Un user authentifié ne voit que les versions
-- des assets qui lui appartiennent (provenance.userId = auth.uid()). Le
-- service_role bypass pour le pipeline serveur.
ALTER TABLE public.report_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_versions_select_user ON public.report_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = report_versions.asset_id
        AND (a.provenance->>'userId') = auth.uid()::text
    )
  );

CREATE POLICY report_versions_insert_user ON public.report_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = report_versions.asset_id
        AND (a.provenance->>'userId') = auth.uid()::text
    )
  );

-- Pas de UPDATE ni DELETE : historique immuable.

CREATE POLICY report_versions_service_all ON public.report_versions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
