-- ============================================================
-- Hearst OS v16 — Scheduler Leases
--
-- Two lease types in one table:
--   "scheduler_leader" — only one instance runs the scheduler
--   "mission_run"      — prevents overlapping runs of the same mission
-- ============================================================

CREATE TABLE IF NOT EXISTS public.scheduler_leases (
  key          text PRIMARY KEY,
  instance_id  text NOT NULL,
  acquired_at  timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  metadata     jsonb DEFAULT '{}'
);

ALTER TABLE public.scheduler_leases ENABLE ROW LEVEL SECURITY;

-- Service-role only — no authenticated user access needed
CREATE POLICY scheduler_leases_service
  ON public.scheduler_leases
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
