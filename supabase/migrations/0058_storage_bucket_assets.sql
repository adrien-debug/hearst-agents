-- 0058_storage_bucket_assets.sql
-- Crée le bucket Supabase Storage `assets` (privé, multi-tenant via prefix tenantId/).
-- Remplace progressivement Cloudflare R2 pour les exports (PDF, audio, vidéo, etc.).

-- Bucket privé : aucune lecture publique. Tout passe par signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'assets',
  'assets',
  false,
  524288000, -- 500 MB
  NULL       -- pas de filtre MIME au niveau bucket (validation côté code)
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

-- ── RLS Policies ─────────────────────────────────────────────────────
-- Le bucket utilise le service_role côté serveur (bypass RLS), donc les
-- writes/reads passent par le SDK avec service_role key. Pas besoin de
-- policies user-side tant que le SDK n'est exposé que côté server.
--
-- Si on expose plus tard une API client (ex: upload direct via signed URL
-- generated server-side), les policies ci-dessous garantissent que l'objet
-- ne peut être lu/écrit que par les users du tenant correspondant.

-- Authenticated read scoped par tenantId (premier segment du path).
CREATE POLICY IF NOT EXISTS "assets_read_own_tenant"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] = (
    SELECT (auth.jwt() ->> 'tenant_id')::text
  )
);

-- Authenticated write scoped par tenantId.
CREATE POLICY IF NOT EXISTS "assets_write_own_tenant"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] = (
    SELECT (auth.jwt() ->> 'tenant_id')::text
  )
);

-- Authenticated delete scoped par tenantId.
CREATE POLICY IF NOT EXISTS "assets_delete_own_tenant"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] = (
    SELECT (auth.jwt() ->> 'tenant_id')::text
  )
);
