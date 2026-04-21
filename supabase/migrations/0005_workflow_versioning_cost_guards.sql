-- ============================================================
-- Hearst Agents v5 — Workflow Versioning, Cost Sentinel, Prompt Guards
-- ============================================================

-- ============================================================
-- 1. WORKFLOW VERSIONS — immutable snapshot of workflow at publication
-- ============================================================

create table if not exists public.workflow_versions (
  id           uuid primary key default gen_random_uuid(),
  workflow_id  uuid not null references public.workflows(id) on delete cascade,
  version      int  not null default 1,
  steps_snapshot jsonb not null default '[]',
  config_snapshot jsonb not null default '{}',
  published_by text,
  changelog    text,
  created_at   timestamptz not null default now(),
  unique (workflow_id, version)
);

create index if not exists idx_workflow_versions_workflow on public.workflow_versions(workflow_id);

-- Track active published version on workflows
alter table public.workflows
  add column if not exists version int not null default 1,
  add column if not exists active_version_id uuid references public.workflow_versions(id) on delete set null;

-- Link runs to exact workflow version
alter table public.runs
  add column if not exists workflow_version_id uuid references public.workflow_versions(id) on delete set null;

-- ============================================================
-- 2. COST SENTINEL — budget enforcement at run level
-- ============================================================

alter table public.runs
  add column if not exists cost_budget_usd real,
  add column if not exists replay_mode text not null default 'live'
    check (replay_mode in ('live', 'stub'));

-- Per-agent cost budget
alter table public.agents
  add column if not exists cost_budget_per_run real;

-- ============================================================
-- 3. PROMPT GUARD — output trust level on traces
-- ============================================================

alter table public.traces
  add column if not exists output_trust text
    check (output_trust in ('verified', 'tool_backed', 'unverified', 'guard_failed', 'stubbed'));

-- ============================================================
-- 4. RLS for workflow_versions
-- ============================================================

alter table public.workflow_versions enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['workflow_versions']
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
