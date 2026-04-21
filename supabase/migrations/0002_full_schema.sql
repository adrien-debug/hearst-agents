-- ============================================================
-- Hearst Managed Agents — full schema
-- Extends the initial agents table with 16-table architecture
-- ============================================================

-- 0. Enable pgvector for embeddings
create extension if not exists vector with schema extensions;

-- ============================================================
-- 1. CORE
-- ============================================================

-- Drop the minimal v1 table so we can recreate with full columns
drop policy if exists "agents_select_anon" on public.agents;
drop policy if exists "agents_select_authenticated" on public.agents;
drop table if exists public.agents cascade;

create table if not exists public.agents (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  description  text,
  model_provider text not null default 'openai',
  model_name     text not null default 'gpt-4o',
  system_prompt  text not null default '',
  temperature    real not null default 0.7,
  max_tokens     int  not null default 4096,
  top_p          real not null default 1.0,
  status       text not null default 'active'
                 check (status in ('active','paused','archived')),
  avatar_url   text,
  metadata     jsonb not null default '{}',
  version      int not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.skills (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  category        text not null default 'general',
  description     text,
  prompt_template text not null default '',
  input_schema    jsonb not null default '{}',
  output_schema   jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

create table if not exists public.agent_skills (
  agent_id uuid not null references public.agents(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  priority int not null default 0,
  config   jsonb not null default '{}',
  primary key (agent_id, skill_id)
);

create table if not exists public.tools (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  description   text,
  endpoint_url  text,
  http_method   text not null default 'POST',
  input_schema  jsonb not null default '{}',
  output_schema jsonb not null default '{}',
  auth_type     text not null default 'none'
                  check (auth_type in ('none','api_key','oauth')),
  auth_config   jsonb not null default '{}',
  timeout_ms    int not null default 30000,
  created_at    timestamptz not null default now()
);

create table if not exists public.agent_tools (
  agent_id uuid not null references public.agents(id) on delete cascade,
  tool_id  uuid not null references public.tools(id) on delete cascade,
  enabled  boolean not null default true,
  config   jsonb not null default '{}',
  primary key (agent_id, tool_id)
);

-- ============================================================
-- 2. KNOWLEDGE (RAG)
-- ============================================================

create table if not exists public.knowledge_bases (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  embedding_model text not null default 'text-embedding-3-small',
  chunk_size      int not null default 512,
  chunk_overlap   int not null default 64,
  created_at      timestamptz not null default now()
);

create table if not exists public.knowledge_documents (
  id                uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  title             text not null,
  content           text not null default '',
  source_url        text,
  chunk_index       int not null default 0,
  metadata          jsonb not null default '{}',
  embedding         extensions.vector(1536),
  created_at        timestamptz not null default now()
);

create table if not exists public.agent_knowledge (
  agent_id          uuid not null references public.agents(id) on delete cascade,
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  primary key (agent_id, knowledge_base_id)
);

-- ============================================================
-- 3. CONVERSATIONS
-- ============================================================

create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references public.agents(id) on delete cascade,
  title           text,
  status          text not null default 'open'
                    check (status in ('open','closed','archived')),
  user_identifier text,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role            text not null check (role in ('system','user','assistant','tool')),
  content         text not null default '',
  tool_calls      jsonb,
  token_count     int,
  latency_ms      int,
  model_used      text,
  created_at      timestamptz not null default now()
);

create table if not exists public.agent_memory (
  id             uuid primary key default gen_random_uuid(),
  agent_id       uuid not null references public.agents(id) on delete cascade,
  memory_type    text not null default 'fact'
                   check (memory_type in ('fact','preference','context','learned')),
  key            text not null,
  value          text not null,
  importance     real not null default 0.5
                   check (importance >= 0 and importance <= 1),
  expires_at     timestamptz,
  last_accessed_at timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- ============================================================
-- 4. WORKFLOWS (ORCHESTRATION)
-- ============================================================

create table if not exists public.workflows (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  trigger_type text not null default 'manual'
                 check (trigger_type in ('manual','schedule','webhook')),
  status       text not null default 'draft'
                 check (status in ('draft','active','archived')),
  created_at   timestamptz not null default now()
);

create table if not exists public.workflow_steps (
  id                uuid primary key default gen_random_uuid(),
  workflow_id       uuid not null references public.workflows(id) on delete cascade,
  step_order        int not null default 0,
  agent_id          uuid references public.agents(id) on delete set null,
  action_type       text not null default 'chat'
                      check (action_type in ('chat','tool_call','condition','loop')),
  config            jsonb not null default '{}',
  on_success_step_id uuid references public.workflow_steps(id) on delete set null,
  on_failure_step_id uuid references public.workflow_steps(id) on delete set null
);

create table if not exists public.workflow_runs (
  id          uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  status      text not null default 'pending'
                check (status in ('pending','running','completed','failed')),
  input       jsonb not null default '{}',
  output      jsonb not null default '{}',
  error       text,
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 5. METRICS
-- ============================================================

create table if not exists public.evaluations (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references public.agents(id) on delete cascade,
  eval_type       text not null default 'accuracy'
                    check (eval_type in ('accuracy','speed','relevance','helpfulness')),
  score           real not null,
  max_score       real not null default 1.0,
  test_input      text,
  expected_output text,
  actual_output   text,
  passed          boolean not null default false,
  created_at      timestamptz not null default now()
);

create table if not exists public.usage_logs (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references public.agents(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  tokens_in       int not null default 0,
  tokens_out      int not null default 0,
  cost_usd        real not null default 0,
  model_used      text,
  latency_ms      int,
  created_at      timestamptz not null default now()
);

create table if not exists public.agent_versions (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references public.agents(id) on delete cascade,
  version         int not null,
  system_prompt   text not null default '',
  config_snapshot jsonb not null default '{}',
  changelog       text,
  created_at      timestamptz not null default now(),
  unique (agent_id, version)
);

-- ============================================================
-- 6. INDEXES
-- ============================================================

create index if not exists idx_agents_status on public.agents(status);
create index if not exists idx_agents_slug on public.agents(slug);
create index if not exists idx_conversations_agent on public.conversations(agent_id);
create index if not exists idx_messages_conversation on public.messages(conversation_id);
create index if not exists idx_messages_created on public.messages(created_at);
create index if not exists idx_agent_memory_agent on public.agent_memory(agent_id);
create index if not exists idx_knowledge_docs_base on public.knowledge_documents(knowledge_base_id);
create index if not exists idx_workflow_steps_workflow on public.workflow_steps(workflow_id);
create index if not exists idx_workflow_runs_workflow on public.workflow_runs(workflow_id);
create index if not exists idx_evaluations_agent on public.evaluations(agent_id);
create index if not exists idx_usage_logs_agent on public.usage_logs(agent_id);
create index if not exists idx_usage_logs_created on public.usage_logs(created_at);
create index if not exists idx_agent_versions_agent on public.agent_versions(agent_id);

-- ============================================================
-- 7. RLS
-- ============================================================

alter table public.agents enable row level security;
alter table public.skills enable row level security;
alter table public.agent_skills enable row level security;
alter table public.tools enable row level security;
alter table public.agent_tools enable row level security;
alter table public.knowledge_bases enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.agent_knowledge enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.agent_memory enable row level security;
alter table public.workflows enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.evaluations enable row level security;
alter table public.usage_logs enable row level security;
alter table public.agent_versions enable row level security;

-- Authenticated users get full read
do $$
declare
  t text;
begin
  foreach t in array array[
    'agents','skills','agent_skills','tools','agent_tools',
    'knowledge_bases','knowledge_documents','agent_knowledge',
    'conversations','messages','agent_memory',
    'workflows','workflow_steps','workflow_runs',
    'evaluations','usage_logs','agent_versions'
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

-- Service role bypass (for API routes using service_role key)
-- service_role already bypasses RLS by default in Supabase

-- Anon read-only on agents (public listing)
create policy agents_select_anon on public.agents for select to anon using (true);

-- ============================================================
-- 8. Updated_at trigger for agents
-- ============================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger agents_updated_at
  before update on public.agents
  for each row execute function public.set_updated_at();
