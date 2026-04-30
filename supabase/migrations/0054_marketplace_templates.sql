-- Hearst OS — C5 Mission Marketplace MVP
--
-- Templates communautaires (workflows, report_specs, personas) partagés entre
-- tenants. Chaque template est immuable une fois publié (sauf archivage par
-- l'auteur). Les autres users peuvent SELECT (publics), cloner dans leur
-- propre tenant, noter ou signaler.
--
-- RLS : SELECT large (tout authentifié), INSERT/UPDATE/DELETE owner-only.

CREATE TABLE IF NOT EXISTS marketplace_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('workflow', 'report_spec', 'persona')),
  title text NOT NULL,
  description text,
  payload jsonb NOT NULL,
  author_user_id text NOT NULL,
  author_tenant_id text NOT NULL,
  author_display_name text,
  tags text[] NOT NULL DEFAULT '{}',
  rating_avg numeric NOT NULL DEFAULT 0,
  rating_count int NOT NULL DEFAULT 0,
  clone_count int NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_kind ON marketplace_templates(kind, is_archived);
CREATE INDEX IF NOT EXISTS idx_marketplace_tags ON marketplace_templates USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_marketplace_author ON marketplace_templates(author_user_id) WHERE NOT is_archived;
CREATE INDEX IF NOT EXISTS idx_marketplace_featured ON marketplace_templates(is_featured) WHERE is_featured AND NOT is_archived;

ALTER TABLE marketplace_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_select_all ON public.marketplace_templates;
CREATE POLICY marketplace_select_all ON public.marketplace_templates
  FOR SELECT TO authenticated
  USING (NOT is_archived);

DROP POLICY IF EXISTS marketplace_insert_owner ON public.marketplace_templates;
CREATE POLICY marketplace_insert_owner ON public.marketplace_templates
  FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid()::text);

DROP POLICY IF EXISTS marketplace_update_owner ON public.marketplace_templates;
CREATE POLICY marketplace_update_owner ON public.marketplace_templates
  FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid()::text);

DROP POLICY IF EXISTS marketplace_service_all ON public.marketplace_templates;
CREATE POLICY marketplace_service_all ON public.marketplace_templates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Ratings ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS marketplace_ratings (
  template_id uuid NOT NULL REFERENCES marketplace_templates(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_ratings_template ON marketplace_ratings(template_id);

ALTER TABLE marketplace_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ratings_select_all ON public.marketplace_ratings;
CREATE POLICY ratings_select_all ON public.marketplace_ratings
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS ratings_insert_owner ON public.marketplace_ratings;
CREATE POLICY ratings_insert_owner ON public.marketplace_ratings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS ratings_update_owner ON public.marketplace_ratings;
CREATE POLICY ratings_update_owner ON public.marketplace_ratings
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS ratings_delete_owner ON public.marketplace_ratings;
CREATE POLICY ratings_delete_owner ON public.marketplace_ratings
  FOR DELETE TO authenticated
  USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS ratings_service_all ON public.marketplace_ratings;
CREATE POLICY ratings_service_all ON public.marketplace_ratings
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Reports abuse ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS marketplace_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES marketplace_templates(id) ON DELETE CASCADE,
  reporter_user_id text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_reports_template ON marketplace_reports(template_id);

ALTER TABLE marketplace_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reports_insert_owner ON public.marketplace_reports;
CREATE POLICY reports_insert_owner ON public.marketplace_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_user_id = auth.uid()::text);

DROP POLICY IF EXISTS reports_select_owner ON public.marketplace_reports;
CREATE POLICY reports_select_owner ON public.marketplace_reports
  FOR SELECT TO authenticated
  USING (reporter_user_id = auth.uid()::text);

DROP POLICY IF EXISTS reports_service_all ON public.marketplace_reports;
CREATE POLICY reports_service_all ON public.marketplace_reports
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Trigger : recalc rating_avg / rating_count ───────────────

CREATE OR REPLACE FUNCTION marketplace_recalc_rating()
RETURNS TRIGGER AS $$
DECLARE
  target_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_id := OLD.template_id;
  ELSE
    target_id := NEW.template_id;
  END IF;

  UPDATE marketplace_templates
  SET
    rating_avg = COALESCE((SELECT AVG(rating)::numeric(4,2) FROM marketplace_ratings WHERE template_id = target_id), 0),
    rating_count = (SELECT COUNT(*) FROM marketplace_ratings WHERE template_id = target_id),
    updated_at = now()
  WHERE id = target_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS marketplace_ratings_recalc ON marketplace_ratings;
CREATE TRIGGER marketplace_ratings_recalc
AFTER INSERT OR UPDATE OR DELETE ON marketplace_ratings
FOR EACH ROW EXECUTE FUNCTION marketplace_recalc_rating();
