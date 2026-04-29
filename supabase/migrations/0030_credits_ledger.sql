-- ============================================================
-- Hearst OS — Credits Ledger
--
-- Tables `user_credits` (solde courant) et `credit_ledger`
-- (historique immutable des opérations).
--
-- Pourquoi : les jobs lourds (génération vidéo HeyGen, browser sessions
-- Browserbase, meeting bots Recall, audio ElevenLabs) ont des coûts
-- variables. Sans middleware `requireCredits()` bloquant pré-job, la
-- marge fond dès qu'un user enchaîne des opérations payantes.
--
-- Modèle : on stocke en USD (numeric 18,6 = précision 6 décimales pour
-- supporter $0.000001 unit costs). UI affiche en $.
-- ============================================================

-- ── user_credits — solde courant ───────────────────────────

CREATE TABLE IF NOT EXISTS public.user_credits (
  -- user_id uuid pour cohérence avec le cleanup 0026 (toutes les
  -- tables user_id sont passées en uuid). auth.uid() retourne uuid,
  -- donc comparaison native dans les policies plus bas.
  user_id        uuid NOT NULL,
  tenant_id      text NOT NULL,
  balance_usd    numeric(18,6) NOT NULL DEFAULT 0,
  reserved_usd   numeric(18,6) NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id),
  CHECK (balance_usd >= 0),
  CHECK (reserved_usd >= 0),
  CHECK (reserved_usd <= balance_usd)
);

CREATE INDEX IF NOT EXISTS idx_user_credits_user
  ON public.user_credits(user_id);

-- ── credit_ledger — historique immutable ───────────────────

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  tenant_id           text NOT NULL,
  operation           text NOT NULL CHECK (operation IN (
    'purchase','refund','job_debit','job_settle','admin_grant','trial_grant'
  )),
  amount_usd          numeric(18,6) NOT NULL,
  balance_after_usd   numeric(18,6) NOT NULL,
  job_id              text,
  job_kind            text,
  description         text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user
  ON public.credit_ledger(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_job
  ON public.credit_ledger(job_id)
  WHERE job_id IS NOT NULL;

-- ── RLS user-scoped ────────────────────────────────────────

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_credits_select_user ON public.user_credits
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY user_credits_service_all ON public.user_credits
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY credit_ledger_select_user ON public.credit_ledger
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY credit_ledger_service_all ON public.credit_ledger
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Trial grant function (1 USD par défaut) ─────────────────

CREATE OR REPLACE FUNCTION public.grant_trial_credits(
  p_user_id uuid,
  p_tenant_id text,
  p_amount_usd numeric DEFAULT 1.0
) RETURNS void AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, tenant_id, balance_usd, reserved_usd)
  VALUES (p_user_id, p_tenant_id, p_amount_usd, 0)
  ON CONFLICT (user_id, tenant_id) DO UPDATE
    SET balance_usd = public.user_credits.balance_usd + EXCLUDED.balance_usd,
        updated_at = now();

  INSERT INTO public.credit_ledger (
    user_id, tenant_id, operation, amount_usd, balance_after_usd, description
  )
  SELECT p_user_id, p_tenant_id, 'trial_grant', p_amount_usd, balance_usd,
         'Trial credit grant'
  FROM public.user_credits
  WHERE user_id = p_user_id AND tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Atomic debit/credit functions (race-safe) ──────────────

CREATE OR REPLACE FUNCTION public.reserve_credits(
  p_user_id uuid,
  p_tenant_id text,
  p_amount_usd numeric,
  p_job_id text,
  p_job_kind text
) RETURNS boolean AS $$
DECLARE
  v_available numeric;
BEGIN
  -- Lock the row to prevent concurrent reservations
  SELECT balance_usd - reserved_usd INTO v_available
  FROM public.user_credits
  WHERE user_id = p_user_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_available IS NULL OR v_available < p_amount_usd THEN
    RETURN false;
  END IF;

  UPDATE public.user_credits
  SET reserved_usd = reserved_usd + p_amount_usd,
      updated_at = now()
  WHERE user_id = p_user_id AND tenant_id = p_tenant_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.settle_credits(
  p_user_id uuid,
  p_tenant_id text,
  p_reserved_usd numeric,
  p_actual_usd numeric,
  p_job_id text,
  p_job_kind text,
  p_description text
) RETURNS void AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  UPDATE public.user_credits
  SET balance_usd = balance_usd - p_actual_usd,
      reserved_usd = GREATEST(0, reserved_usd - p_reserved_usd),
      updated_at = now()
  WHERE user_id = p_user_id AND tenant_id = p_tenant_id
  RETURNING balance_usd INTO v_new_balance;

  INSERT INTO public.credit_ledger (
    user_id, tenant_id, operation, amount_usd, balance_after_usd,
    job_id, job_kind, description
  ) VALUES (
    p_user_id, p_tenant_id, 'job_settle', -p_actual_usd, v_new_balance,
    p_job_id, p_job_kind, p_description
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
