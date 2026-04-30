-- Hearst OS — Analytics : tenant_id directe sur `runs`
--
-- Avant : aggregate.ts dérive le tenant via `users.tenant_ids[0]`. Cette
-- heuristique est fragile (un user peut appartenir à plusieurs tenants, et
-- la table `users` peut ne pas exister en dev). Résultat audit : 26/26 runs
-- classés `tenant:"unknown"`.
--
-- Fix : colonne directe `tenant_id` denormalisée au INSERT côté
-- `lib/engine/runtime/state/adapter.ts::saveRun`. Backfill best-effort
-- depuis `users.tenant_ids[0]` pour ne pas perdre l'historique.

ALTER TABLE runs ADD COLUMN IF NOT EXISTS tenant_id text;
CREATE INDEX IF NOT EXISTS idx_runs_tenant_id ON runs(tenant_id);

-- Backfill best-effort pour les runs existants. Toléré si la table `users`
-- n'existe pas (CTE conditional via DO block).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
    UPDATE runs r
    SET tenant_id = (
      SELECT u.tenant_ids[1] FROM users u WHERE u.id = r.user_id LIMIT 1
    )
    WHERE r.tenant_id IS NULL;
  END IF;
END $$;
