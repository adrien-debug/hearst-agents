-- ============================================================
-- Hearst OS — Watchlist anomaly narrée (vague 9, action #3)
--
-- Stocke un snapshot horodaté de chaque KPI watchlist (MRR, ARR,
-- pipeline, runway, ...) à chaque rafraîchissement du cockpit.
-- L'historique permet :
--  - de calculer un écart vs baseline N jours
--  - quand l'écart dépasse un seuil, de déclencher la narration
--    causale via Sonnet ("MRR -8% en 7j → 3 deals stuck > 35j")
--
-- Append-only — on ne fait JAMAIS d'update sur cette table. La
-- déduplication (pas plus d'1 snapshot/heure par metric par user)
-- est gérée applicativement.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.metric_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  tenant_id   text NOT NULL,
  metric_id   text NOT NULL,
  value       numeric NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Index principal : lookup des N derniers snapshots pour une métrique donnée.
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_user_metric_time
  ON public.metric_snapshots (user_id, tenant_id, metric_id, captured_at DESC);

-- Index secondaire pour purger les snapshots > 90j (tâche manuelle, pas de
-- cron Supabase pour l'instant).
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_captured_at
  ON public.metric_snapshots (captured_at);

ALTER TABLE public.metric_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS metric_snapshots_service_all ON public.metric_snapshots;
CREATE POLICY metric_snapshots_service_all ON public.metric_snapshots
  FOR ALL USING (true) WITH CHECK (true);
