-- ============================================================
-- Hearst OS — Memory LTM (C1) : RPC match_embeddings
--
-- Cosine similarity top-K via l'opérateur pgvector `<=>`. Sans cette
-- RPC, `searchEmbeddings()` retombe sur un fallback JS qui charge
-- 2000 rows en mémoire et trie côté Node — inacceptable en prod.
--
-- Scope : filtre obligatoire (user_id, tenant_id), filtre optionnel
-- sur source_kind via tableau text[] (NULL = toutes les sources).
-- Stable function, exécutée avec le service_role.
-- ============================================================

CREATE OR REPLACE FUNCTION public.match_embeddings(
  query_embedding extensions.vector(1536),
  match_user_id   text,
  match_tenant_id text,
  match_count     int    DEFAULT 5,
  source_kinds    text[] DEFAULT NULL
)
RETURNS TABLE (
  id           uuid,
  source_kind  text,
  source_id    text,
  text_excerpt text,
  metadata     jsonb,
  similarity   float,
  created_at   timestamptz
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.id,
    e.source_kind,
    e.source_id,
    e.text_excerpt,
    e.metadata,
    1 - (e.embedding <=> query_embedding) AS similarity,
    e.created_at
  FROM public.embeddings e
  WHERE e.user_id = match_user_id
    AND e.tenant_id = match_tenant_id
    AND (source_kinds IS NULL OR e.source_kind = ANY(source_kinds))
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_embeddings(
  extensions.vector(1536), text, text, int, text[]
) TO service_role;
