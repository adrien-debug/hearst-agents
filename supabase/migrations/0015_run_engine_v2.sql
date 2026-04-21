-- ============================================================
-- Hearst OS v15 — Run Engine v2
--
-- Extends runs table with v2 columns.
-- Creates: run_steps, run_approvals, run_logs,
--          artifacts, artifact_versions,
--          document_sessions,
--          plans, plan_steps,
--          action_plans, action_plan_steps, action_executions
-- ============================================================

-- ============================================================
-- 1. Extend run_status enum with new states
-- ============================================================

ALTER TYPE public.run_status ADD VALUE IF NOT EXISTS 'created';
ALTER TYPE public.run_status ADD VALUE IF NOT EXISTS 'awaiting_approval';
ALTER TYPE public.run_status ADD VALUE IF NOT EXISTS 'awaiting_clarification';

-- ============================================================
-- 2. Extend runs table with v2 columns
-- ============================================================

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS user_id text,
  ADD COLUMN IF NOT EXISTS entrypoint text DEFAULT 'chat'
    CHECK (entrypoint IN ('chat', 'webhook', 'api')),
  ADD COLUMN IF NOT EXISTS request jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cost jsonb DEFAULT '{"llm_input_tokens":0,"llm_output_tokens":0,"tool_calls":0}',
  ADD COLUMN IF NOT EXISTS current_plan_id uuid,
  ADD COLUMN IF NOT EXISTS current_action_plan_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

create index IF NOT EXISTS idx_runs_user_id ON public.runs(user_id);

-- ============================================================
-- 3. run_steps — granular execution steps within a Run
-- ============================================================

CREATE TABLE IF NOT EXISTS public.run_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  parent_step_id  uuid REFERENCES public.run_steps(id),
  seq             int NOT NULL,
  type            text NOT NULL CHECK (type IN ('orchestrator','delegate','tool_call','approval','artifact_build')),
  actor           text NOT NULL,
  title           text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','completed','failed','awaiting_approval','skipped')),
  input           jsonb,
  output          jsonb,
  error           jsonb,
  retry_count     int NOT NULL DEFAULT 0,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

create index IF NOT EXISTS idx_run_steps_run ON public.run_steps(run_id, seq);

-- ============================================================
-- 4. run_approvals — approval gates for write actions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.run_approvals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  step_id         uuid NOT NULL REFERENCES public.run_steps(id),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','expired')),
  kind            text NOT NULL,
  summary         text NOT NULL,
  proposed_action jsonb NOT NULL,
  reversible      boolean NOT NULL DEFAULT false,
  decided_at      timestamptz,
  decided_by      text,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. run_logs — structured log entries for observability
-- ============================================================

CREATE TABLE IF NOT EXISTS public.run_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  step_id     uuid REFERENCES public.run_steps(id),
  at          timestamptz NOT NULL DEFAULT now(),
  level       text NOT NULL CHECK (level IN ('info','warning','error')),
  actor       text,
  message     text NOT NULL
);

create index IF NOT EXISTS idx_run_logs_run ON public.run_logs(run_id, at);

-- ============================================================
-- 6. artifacts — unified document/output model
-- ============================================================

CREATE TABLE IF NOT EXISTS public.artifacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              uuid REFERENCES public.runs(id),
  user_id             text NOT NULL,
  type                text NOT NULL CHECK (type IN ('chat_response','draft','memo','report','deliverable')),
  title               text NOT NULL,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  format              text NOT NULL DEFAULT 'markdown'
                      CHECK (format IN ('text','markdown','html','pdf_ready','json')),
  summary             text,
  content             text NOT NULL,
  sections            jsonb NOT NULL DEFAULT '[]',
  sources             jsonb NOT NULL DEFAULT '[]',
  metadata            jsonb NOT NULL DEFAULT '{}',
  version             int NOT NULL DEFAULT 1,
  parent_artifact_id  uuid REFERENCES public.artifacts(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

create index IF NOT EXISTS idx_artifacts_run ON public.artifacts(run_id);
create index IF NOT EXISTS idx_artifacts_user ON public.artifacts(user_id);

-- ============================================================
-- 7. artifact_versions — version history for artifacts
-- ============================================================

CREATE TABLE IF NOT EXISTS public.artifact_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id     uuid NOT NULL REFERENCES public.artifacts(id) ON DELETE CASCADE,
  version         int NOT NULL,
  content         text NOT NULL,
  sections        jsonb NOT NULL,
  change_summary  text,
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(artifact_id, version)
);

-- ============================================================
-- 8. document_sessions — multi-tour document building
-- ============================================================

CREATE TABLE IF NOT EXISTS public.document_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES public.runs(id),
  artifact_id     uuid REFERENCES public.artifacts(id),
  user_id         text NOT NULL,
  title           text NOT NULL,
  document_type   text NOT NULL,
  status          text NOT NULL DEFAULT 'building'
                  CHECK (status IN ('building','review','revising','finalized','exported')),
  outline         jsonb NOT NULL DEFAULT '[]',
  sources         jsonb NOT NULL DEFAULT '[]',
  metadata        jsonb NOT NULL DEFAULT '{}',
  current_version int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 9. plans — cognitive plans from the Orchestrator
-- ============================================================

CREATE TABLE IF NOT EXISTS public.plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  reasoning   text NOT NULL,
  status      text NOT NULL DEFAULT 'active'
              CHECK (status IN ('active','completed','abandoned')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_steps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  "order"           int NOT NULL,
  intent            text NOT NULL,
  agent             text NOT NULL,
  task_description  text NOT NULL,
  expected_output   text NOT NULL,
  retrieval_mode    text,
  depends_on        uuid[] DEFAULT '{}',
  optional          boolean NOT NULL DEFAULT false,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','completed','failed','skipped')),
  run_step_id       uuid REFERENCES public.run_steps(id),
  completed_at      timestamptz
);

create index IF NOT EXISTS idx_plan_steps_plan ON public.plan_steps(plan_id, "order");

-- Add FK from runs to plans (deferred because plans references runs)
ALTER TABLE public.runs
  ADD CONSTRAINT fk_runs_current_plan
  FOREIGN KEY (current_plan_id) REFERENCES public.plans(id)
  ON DELETE SET NULL
  NOT VALID;

-- ============================================================
-- 10. action_plans — executable plans with side effects
-- ============================================================

CREATE TABLE IF NOT EXISTS public.action_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  plan_id     uuid REFERENCES public.plans(id),
  created_by  text NOT NULL,
  summary     text NOT NULL,
  status      text NOT NULL DEFAULT 'proposed'
              CHECK (status IN ('proposed','approved','partially_approved',
                                'executing','completed','failed','rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz
);

CREATE TABLE IF NOT EXISTS public.action_plan_steps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_plan_id    uuid NOT NULL REFERENCES public.action_plans(id) ON DELETE CASCADE,
  "order"           int NOT NULL,
  tool              text NOT NULL,
  pack              text NOT NULL,
  params            jsonb NOT NULL,
  description       text NOT NULL,
  severity          text NOT NULL CHECK (severity IN ('safe','sensitive','destructive')),
  reversible        boolean NOT NULL DEFAULT false,
  requires_approval boolean NOT NULL DEFAULT true,
  approval_status   text NOT NULL DEFAULT 'pending'
                    CHECK (approval_status IN ('pending','approved','rejected')),
  execution_status  text NOT NULL DEFAULT 'pending'
                    CHECK (execution_status IN ('pending','running','completed','failed','skipped')),
  idempotency_key   text NOT NULL,
  result            jsonb,
  error             jsonb,
  executed_at       timestamptz
);

create index IF NOT EXISTS idx_aps_plan ON public.action_plan_steps(action_plan_id, "order");

-- Add FK from runs to action_plans
ALTER TABLE public.runs
  ADD CONSTRAINT fk_runs_current_action_plan
  FOREIGN KEY (current_action_plan_id) REFERENCES public.action_plans(id)
  ON DELETE SET NULL
  NOT VALID;

-- ============================================================
-- 11. action_executions — idempotent execution log for Operator
-- ============================================================

CREATE TABLE IF NOT EXISTS public.action_executions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_step_id  uuid NOT NULL REFERENCES public.action_plan_steps(id),
  run_id          uuid NOT NULL REFERENCES public.runs(id),
  step_id         uuid NOT NULL REFERENCES public.run_steps(id),
  tool            text NOT NULL,
  params          jsonb NOT NULL,
  idempotency_key text NOT NULL,
  status          text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','completed','failed')),
  result          jsonb,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

create unique index IF NOT EXISTS idx_action_exec_idemp
  ON public.action_executions(idempotency_key)
  WHERE status = 'completed';

-- ============================================================
-- 12. RLS for new tables
-- ============================================================

ALTER TABLE public.run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifact_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_plan_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_executions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'run_steps','run_approvals','run_logs',
    'artifacts','artifact_versions','document_sessions',
    'plans','plan_steps',
    'action_plans','action_plan_steps','action_executions'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_auth', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_select_auth', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_auth', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
      t || '_insert_auth', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update_auth', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
      t || '_update_auth', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_auth', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (true)',
      t || '_delete_auth', t
    );
  END LOOP;
END $$;
