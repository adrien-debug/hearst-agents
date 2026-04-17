-- ============================================================
-- Hearst Agents v3 — Runtime, Observability, Governance
-- Adds: runs, traces, model_profiles, memory_policies, datasets
-- Evolves: agents (active_version_id), skills (versioning)
-- ============================================================

-- ============================================================
-- 1. MODEL PROFILES — named provider+model+params configurations
-- ============================================================

create table public.model_profiles (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  provider       text not null,
  model          text not null,
  temperature    real not null default 0.7,
  max_tokens     int  not null default 4096,
  top_p          real not null default 1.0,
  fallback_profile_id uuid references public.model_profiles(id) on delete set null,
  cost_per_1k_in   real not null default 0,
  cost_per_1k_out  real not null default 0,
  max_cost_per_run real,
  is_default     boolean not null default false,
  metadata       jsonb not null default '{}',
  created_at     timestamptz not null default now()
);

create index idx_model_profiles_provider on public.model_profiles(provider);

-- Link agents to a model profile instead of raw provider/model
alter table public.agents
  add column if not exists model_profile_id uuid references public.model_profiles(id) on delete set null;

-- ============================================================
-- 2. RUNS — top-level execution record (replaces scattered usage_logs)
-- ============================================================

create type public.run_kind as enum ('chat', 'workflow', 'evaluation', 'tool_test');
create type public.run_status as enum ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout');

create table public.runs (
  id                uuid primary key default gen_random_uuid(),
  kind              public.run_kind not null,
  status            public.run_status not null default 'pending',
  agent_id          uuid references public.agents(id) on delete set null,
  agent_version_id  uuid references public.agent_versions(id) on delete set null,
  workflow_id       uuid references public.workflows(id) on delete set null,
  conversation_id   uuid references public.conversations(id) on delete set null,
  model_profile_id  uuid references public.model_profiles(id) on delete set null,
  input             jsonb not null default '{}',
  output            jsonb not null default '{}',
  error             text,
  tokens_in         int not null default 0,
  tokens_out        int not null default 0,
  cost_usd          real not null default 0,
  latency_ms        int,
  metadata          jsonb not null default '{}',
  parent_run_id     uuid references public.runs(id) on delete set null,
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index idx_runs_agent on public.runs(agent_id);
create index idx_runs_kind on public.runs(kind);
create index idx_runs_status on public.runs(status);
create index idx_runs_created on public.runs(created_at);
create index idx_runs_parent on public.runs(parent_run_id);
create index idx_runs_conversation on public.runs(conversation_id);

-- ============================================================
-- 3. TRACES — granular record of every operation within a run
-- ============================================================

create type public.trace_kind as enum (
  'llm_call', 'tool_call', 'memory_read', 'memory_write',
  'skill_invoke', 'condition_eval', 'error', 'guard', 'custom'
);

create table public.traces (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.runs(id) on delete cascade,
  parent_trace_id uuid references public.traces(id) on delete set null,
  kind          public.trace_kind not null,
  step_index    int not null default 0,
  name          text not null default '',
  input         jsonb not null default '{}',
  output        jsonb not null default '{}',
  error         text,
  tokens_in     int,
  tokens_out    int,
  cost_usd      real,
  latency_ms    int,
  model_used    text,
  metadata      jsonb not null default '{}',
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index idx_traces_run on public.traces(run_id);
create index idx_traces_kind on public.traces(kind);
create index idx_traces_parent on public.traces(parent_trace_id);

-- ============================================================
-- 4. MEMORY POLICIES — governance rules for agent memory
-- ============================================================

create table public.memory_policies (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  description    text,
  max_entries    int not null default 1000,
  ttl_seconds    int,
  min_importance real not null default 0,
  auto_summarize boolean not null default false,
  auto_expire    boolean not null default true,
  dedup_strategy text not null default 'latest'
                   check (dedup_strategy in ('latest', 'highest_importance', 'merge')),
  created_at     timestamptz not null default now()
);

-- Link agents to memory policies
alter table public.agents
  add column if not exists memory_policy_id uuid references public.memory_policies(id) on delete set null;

-- ============================================================
-- 5. DATASETS & EVAL ENTRIES — structured evaluation
-- ============================================================

create table public.datasets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  agent_id    uuid references public.agents(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.dataset_entries (
  id              uuid primary key default gen_random_uuid(),
  dataset_id      uuid not null references public.datasets(id) on delete cascade,
  input           text not null,
  expected_output text not null,
  tags            text[] not null default '{}',
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

create index idx_dataset_entries_dataset on public.dataset_entries(dataset_id);

-- Evolve evaluations: link to run + dataset_entry for full traceability
alter table public.evaluations
  add column if not exists run_id uuid references public.runs(id) on delete set null,
  add column if not exists dataset_entry_id uuid references public.dataset_entries(id) on delete set null;

-- ============================================================
-- 6. AGENT VERSION EVOLUTION — make versions the source of truth
-- ============================================================

alter table public.agents
  add column if not exists active_version_id uuid references public.agent_versions(id) on delete set null;

-- Add model_profile to agent_versions for exact replay
alter table public.agent_versions
  add column if not exists model_profile_id uuid references public.model_profiles(id) on delete set null;

-- ============================================================
-- 7. SKILL VERSIONING
-- ============================================================

create table public.skill_versions (
  id              uuid primary key default gen_random_uuid(),
  skill_id        uuid not null references public.skills(id) on delete cascade,
  version         int not null,
  prompt_template text not null default '',
  input_schema    jsonb not null default '{}',
  output_schema   jsonb not null default '{}',
  changelog       text,
  created_at      timestamptz not null default now(),
  unique (skill_id, version)
);

alter table public.skills
  add column if not exists active_version int not null default 1;

-- ============================================================
-- 8. RLS + POLICIES for new tables
-- ============================================================

alter table public.model_profiles enable row level security;
alter table public.runs enable row level security;
alter table public.traces enable row level security;
alter table public.memory_policies enable row level security;
alter table public.datasets enable row level security;
alter table public.dataset_entries enable row level security;
alter table public.skill_versions enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'model_profiles','runs','traces','memory_policies',
    'datasets','dataset_entries','skill_versions'
  ]
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
