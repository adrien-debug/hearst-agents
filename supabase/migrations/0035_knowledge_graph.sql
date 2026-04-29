-- ============================================================
-- Hearst OS — Knowledge Graph Privé (Signature 7 MVP)
--
-- Tables minimales pour graphe entité→relation, scoped par user.
-- Phase B suivante : Letta + pgvector pour mémoire long terme.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kg_nodes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL,
  tenant_id    text NOT NULL,
  type         text NOT NULL,  -- person, company, project, decision, commitment, topic
  label        text NOT NULL,
  properties   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, type, label)
);

CREATE TABLE IF NOT EXISTS public.kg_edges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL,
  tenant_id    text NOT NULL,
  source_id    uuid NOT NULL REFERENCES public.kg_nodes(id) ON DELETE CASCADE,
  target_id    uuid NOT NULL REFERENCES public.kg_nodes(id) ON DELETE CASCADE,
  type         text NOT NULL,  -- works_at, mentioned, owns, depends_on, related_to
  weight       float NOT NULL DEFAULT 1.0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, source_id, target_id, type)
);

CREATE INDEX IF NOT EXISTS idx_kg_nodes_user_type ON public.kg_nodes (user_id, type);
CREATE INDEX IF NOT EXISTS idx_kg_edges_user_source ON public.kg_edges (user_id, source_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_user_target ON public.kg_edges (user_id, target_id);

ALTER TABLE public.kg_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kg_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY kg_nodes_user_isolation ON public.kg_nodes
  FOR ALL USING (user_id = current_setting('app.current_user_id', true));
CREATE POLICY kg_edges_user_isolation ON public.kg_edges
  FOR ALL USING (user_id = current_setting('app.current_user_id', true));
