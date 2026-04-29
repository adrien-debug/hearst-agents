-- ============================================================
-- Hearst OS — Asset Variants
--
-- Un Asset peut avoir plusieurs variants : texte (default), audio
-- (TTS voice clone), vidéo (HeyGen avatar), slides (deck), site
-- (HTML déployable). Chaque variant est généré à la demande par un
-- worker BullMQ.
--
-- L'idée produit : « Brand Voice OS » — un rapport texte génère son
-- variant audio sur click, son variant vidéo sur click. Les variants
-- s'affichent en onglets dans la FocalStage / AssetStage.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.asset_variants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id          text NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('text','audio','video','slides','site','image','code')),
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','generating','ready','failed')),
  job_id            text,
  storage_url       text,
  mime_type         text,
  size_bytes        bigint,
  duration_seconds  numeric,
  generated_at      timestamptz,
  provider          text,
  error             text,
  metadata          jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_variants_asset
  ON public.asset_variants(asset_id, kind);

CREATE INDEX IF NOT EXISTS idx_asset_variants_status
  ON public.asset_variants(status)
  WHERE status IN ('pending','generating');

-- ── RLS user-scoped via jointure sur assets ────────────────

ALTER TABLE public.asset_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY asset_variants_select_user ON public.asset_variants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = public.asset_variants.asset_id
        AND ((a.provenance->>'userId') = auth.uid()::text
          OR (a.provenance->>'userId') IS NULL)
    )
  );

CREATE POLICY asset_variants_service_all ON public.asset_variants
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Trigger updated_at auto ────────────────────────────────

CREATE OR REPLACE FUNCTION public._asset_variants_touch()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS asset_variants_touch ON public.asset_variants;
CREATE TRIGGER asset_variants_touch
  BEFORE UPDATE ON public.asset_variants
  FOR EACH ROW EXECUTE FUNCTION public._asset_variants_touch();
