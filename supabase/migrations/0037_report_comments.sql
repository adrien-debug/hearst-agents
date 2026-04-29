-- ============================================================
-- Hearst OS — Report Comments (annotation collaborative basique)
--
-- Permet à un utilisateur authentifié d'annoter un report (asset kind=report).
-- - block_ref est nullable : commentaire global OU lié à un bloc précis.
-- - tenant_id est text (cf provenance.tenantId pattern existant).
-- - created_by est uuid (auth.uid()) — RLS aligné sur le pattern user-scoped
--   des migrations 0028/0036.
-- - DELETE limité à l'auteur OU au service_role (admin / cleanup).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.report_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id    text NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  tenant_id   text NOT NULL,
  user_id     uuid NOT NULL,
  block_ref   text,
  body        text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_comments_asset ON public.report_comments (asset_id);
CREATE INDEX IF NOT EXISTS idx_report_comments_tenant ON public.report_comments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_comments_created ON public.report_comments (created_at DESC);

-- ── RLS user-scoped, aligné sur 0028 + 0036 ─────────────────
--
-- Pattern : un user voit ses commentaires + tous les commentaires sur un asset
-- dont il est propriétaire (provenance.userId = auth.uid()). Cela évite qu'un
-- user A voie les commentaires d'un user B sur un asset partagé futur, tout
-- en garantissant que le propriétaire d'un report voit toutes les annotations.
ALTER TABLE public.report_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_comments_select_user ON public.report_comments
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = report_comments.asset_id
        AND (a.provenance->>'userId') = auth.uid()::text
    )
  );

CREATE POLICY report_comments_insert_user ON public.report_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY report_comments_update_owner ON public.report_comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY report_comments_delete_owner ON public.report_comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Service role bypass (admin / cleanup tooling)
CREATE POLICY report_comments_service_all ON public.report_comments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
