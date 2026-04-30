-- Migration 0044 : Plan Steps Extended (Mission Control B1)
-- Ajoute les colonnes nécessaires pour persister un plan multi-step :
--   step_kind     : kind du step planner (analyze, deliver, generate_asset, …)
--   approval_state: pending | approved | rejected | skipped (NULL si pas un gate)
--   output_ref    : référence vers asset/storage du résultat partiel
--   cost_usd      : coût attribué au step (USD, numeric)
-- Idempotent : ADD COLUMN IF NOT EXISTS — peut être appliqué plusieurs fois.

ALTER TABLE public.run_steps
  ADD COLUMN IF NOT EXISTS step_kind text,
  ADD COLUMN IF NOT EXISTS approval_state text,
  ADD COLUMN IF NOT EXISTS output_ref text,
  ADD COLUMN IF NOT EXISTS cost_usd numeric(12, 6);

-- Index utile pour filtrer les steps par approval_state lors d'un resume.
CREATE INDEX IF NOT EXISTS idx_run_steps_approval_state
  ON public.run_steps(approval_state)
  WHERE approval_state IS NOT NULL;

-- Index pour les step_kind les plus fréquents (analytics / debug).
CREATE INDEX IF NOT EXISTS idx_run_steps_step_kind
  ON public.run_steps(step_kind)
  WHERE step_kind IS NOT NULL;

COMMENT ON COLUMN public.run_steps.step_kind IS
  'Mission Control B1 : kind du step planner (analyze, deliver, generate_asset, …).';
COMMENT ON COLUMN public.run_steps.approval_state IS
  'Mission Control B1 : pending | approved | rejected | skipped (NULL si non-gate).';
COMMENT ON COLUMN public.run_steps.output_ref IS
  'Mission Control B1 : référence vers asset/storage du résultat partiel.';
COMMENT ON COLUMN public.run_steps.cost_usd IS
  'Mission Control B1 : coût attribué au step (USD).';
