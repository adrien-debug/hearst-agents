-- ============================================================
-- Hearst OS — Memory LTM (C1) : pgvector + embeddings
--
-- Stocke un embedding 1536-dim (OpenAI text-embedding-3-small)
-- par "souvenir" : message user/assistant, asset, briefing, KG node,
-- transcript audio. Le retrieval se fait via cosine distance sur
-- l'index IVFFlat.
--
-- Scope : user_id + tenant_id (multi-tenant safe).
-- Idempotence : UNIQUE (user_id, tenant_id, source_kind, source_id)
-- → ON CONFLICT DO UPDATE pour ré-embedder un message édité.
-- ============================================================

-- pgvector déjà activé en 0002 (extensions.vector). On référence
-- ce type via le schema extensions ; rendre l'extension dispo dans
-- le search_path public n'est pas nécessaire.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.embeddings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text NOT NULL,
  tenant_id     text NOT NULL,
  source_kind   text NOT NULL CHECK (source_kind IN ('message','asset','briefing','kg_node','transcript')),
  source_id     text NOT NULL,
  text_excerpt  text NOT NULL,
  embedding     extensions.vector(1536) NOT NULL,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, source_kind, source_id)
);

CREATE INDEX IF NOT EXISTS idx_embeddings_user_tenant
  ON public.embeddings (user_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_embeddings_source
  ON public.embeddings (source_kind, source_id);

-- IVFFlat index for cosine similarity. lists=100 est OK jusqu'à
-- ~1M rows ; pour <1k rows la perf reste correcte (sequential scan
-- sur le filtre user_id avant l'ANN).
CREATE INDEX IF NOT EXISTS idx_embeddings_vector
  ON public.embeddings
  USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE public.embeddings ENABLE ROW LEVEL SECURITY;

-- Service role bypass (Supabase admin). User isolation enforced
-- côté application : tous nos accès passent par le service role
-- et filtrent par user_id explicite. Les policies permissives ici
-- évitent les surprises avec les autres consommateurs Supabase.
DROP POLICY IF EXISTS embeddings_service_all ON public.embeddings;
CREATE POLICY embeddings_service_all ON public.embeddings
  FOR ALL USING (true) WITH CHECK (true);
