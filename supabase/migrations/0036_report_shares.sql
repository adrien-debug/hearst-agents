-- ============================================================
-- Hearst OS — Report Shares (signed public links)
--
-- Permet de partager un report via une URL signée temporaire (HMAC).
-- - assets.id étant `text` (pas uuid), on conserve cette typage côté FK.
-- - Le tenant_id est text (cf provenance.tenantId pattern existant).
-- - On stocke uniquement le HASH du token (jamais le token raw),
--   le caller produit une URL `/<base>/public/reports/{token}` avec
--   `token = base64url(payload).hmac` calculé à la création.
-- - expires_at est borné côté code (TTL_MAX_HOURS = 168h = 7j).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.report_shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id    text NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  tenant_id   text NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  created_by  uuid,
  view_count  integer NOT NULL DEFAULT 0,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_shares_token_hash ON public.report_shares (token_hash);
CREATE INDEX IF NOT EXISTS idx_report_shares_tenant ON public.report_shares (tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_shares_asset ON public.report_shares (asset_id);
CREATE INDEX IF NOT EXISTS idx_report_shares_expires ON public.report_shares (expires_at);

-- RLS : un user authentifié ne voit que les shares de son tenant.
-- Le service_role bypass pour l'API publique (lookup par token_hash).
ALTER TABLE public.report_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_shares_select_user ON public.report_shares
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = report_shares.asset_id
        AND (a.provenance->>'userId') = auth.uid()::text
    )
  );

CREATE POLICY report_shares_insert_user ON public.report_shares
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY report_shares_update_user ON public.report_shares
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY report_shares_service_all ON public.report_shares
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- Report Exports (PDF/XLSX) — métadonnées d'export
-- Le binaire est stocké via le storage provider (clé = storage_key),
-- on garde la trace en DB pour audit / TTL / lookup.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.report_exports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id     text NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  tenant_id    text NOT NULL,
  format       text NOT NULL CHECK (format IN ('pdf', 'xlsx')),
  storage_key  text NOT NULL,
  size_bytes   bigint NOT NULL DEFAULT 0,
  created_by   uuid,
  mission_id   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_exports_asset ON public.report_exports (asset_id);
CREATE INDEX IF NOT EXISTS idx_report_exports_tenant ON public.report_exports (tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_exports_created ON public.report_exports (created_at DESC);

ALTER TABLE public.report_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_exports_select_user ON public.report_exports
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = report_exports.asset_id
        AND (a.provenance->>'userId') = auth.uid()::text
    )
  );

CREATE POLICY report_exports_service_all ON public.report_exports
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
