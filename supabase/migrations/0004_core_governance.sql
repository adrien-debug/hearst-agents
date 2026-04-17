-- ============================================================
-- Hearst Agents v4 — Core Governance, Prompt Registry, Tool Governance
-- Adds: prompt_artifacts, tool governance columns, run lifecycle fields
-- ============================================================

-- ============================================================
-- 1. PROMPT ARTIFACT REGISTRY
-- Versioned, checksummed, scoped prompt artifacts.
-- Every critical prompt is an immutable artifact with lineage.
-- ============================================================

create table public.prompt_artifacts (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null,
  version      int  not null default 1,
  kind         text not null
                 check (kind in ('system_prompt', 'skill_prompt', 'workflow_instruction',
                                 'tool_template', 'guard_prompt', 'eval_prompt', 'custom')),
  scope        text not null default 'global'
                 check (scope in ('global', 'agent', 'skill', 'workflow')),
  content      text not null,
  content_hash text not null,
  description  text,
  agent_id     uuid references public.agents(id) on delete set null,
  skill_id     uuid references public.skills(id) on delete set null,
  workflow_id  uuid references public.workflows(id) on delete set null,
  parent_id    uuid references public.prompt_artifacts(id) on delete set null,
  metadata     jsonb not null default '{}',
  created_by   text,
  created_at   timestamptz not null default now(),
  unique (slug, version)
);

create index idx_prompt_artifacts_slug on public.prompt_artifacts(slug);
create index idx_prompt_artifacts_kind on public.prompt_artifacts(kind);
create index idx_prompt_artifacts_scope on public.prompt_artifacts(scope);
create index idx_prompt_artifacts_agent on public.prompt_artifacts(agent_id);
create index idx_prompt_artifacts_skill on public.prompt_artifacts(skill_id);

-- ============================================================
-- 2. TOOL GOVERNANCE — risk, policies, kill switch
-- Extend tools table with governance columns
-- ============================================================

alter table public.tools
  add column if not exists risk_level text not null default 'low'
    check (risk_level in ('low', 'medium', 'high', 'critical')),
  add column if not exists retry_policy jsonb not null default '{"max_retries": 0, "backoff_ms": 1000, "backoff_multiplier": 2}'::jsonb,
  add column if not exists rate_limit jsonb not null default '{"max_calls_per_minute": 60, "max_calls_per_run": 100}'::jsonb,
  add column if not exists requires_sandbox boolean not null default false,
  add column if not exists kill_switch boolean not null default false,
  add column if not exists enabled boolean not null default true;

-- Extend agent_tools with per-agent governance overrides
alter table public.agent_tools
  add column if not exists timeout_override_ms int,
  add column if not exists max_calls_per_run int,
  add column if not exists risk_accepted boolean not null default false;

-- ============================================================
-- 3. RUN LIFECYCLE — retry tracking, timeout config, causality
-- ============================================================

alter table public.runs
  add column if not exists retry_count int not null default 0,
  add column if not exists max_retries int not null default 0,
  add column if not exists timeout_ms int,
  add column if not exists trigger text not null default 'api'
    check (trigger in ('api', 'workflow', 'schedule', 'replay', 'eval')),
  add column if not exists replay_of_run_id uuid references public.runs(id) on delete set null,
  add column if not exists prompt_artifact_id uuid references public.prompt_artifacts(id) on delete set null;

create index idx_runs_replay on public.runs(replay_of_run_id);

-- ============================================================
-- 4. TRACE PAYLOAD — status field for individual trace lifecycle
-- ============================================================

alter table public.traces
  add column if not exists status text not null default 'completed'
    check (status in ('pending', 'running', 'completed', 'failed', 'skipped', 'timeout'));

-- ============================================================
-- 5. RLS for prompt_artifacts
-- ============================================================

alter table public.prompt_artifacts enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['prompt_artifacts']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select_auth', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (true)',
      t || '_insert_auth', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (true) with check (true)',
      t || '_update_auth', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (true)',
      t || '_delete_auth', t
    );
  end loop;
end $$;

-- ============================================================
-- 6. Extend workflow_steps with 'transform' action type
-- (was enforced in code but missing from DB check constraint)
-- ============================================================

alter table public.workflow_steps
  drop constraint if exists workflow_steps_action_type_check;

alter table public.workflow_steps
  add constraint workflow_steps_action_type_check
    check (action_type in ('chat', 'tool_call', 'condition', 'loop', 'transform'));
