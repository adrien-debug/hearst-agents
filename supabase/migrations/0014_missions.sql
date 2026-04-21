-- ============================================================
-- Hearst OS — Missions persistence
-- Stores missions triggered from chat and their execution runs.
-- ============================================================

create type public.mission_status as enum (
  'created', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled'
);

create table if not exists public.missions (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  agent_id    uuid references public.agents(id) on delete set null,
  title       text not null,
  surface     text not null default 'home',
  status      public.mission_status not null default 'created',
  actions     jsonb not null default '[]',
  services    text[] not null default '{}',
  result      text,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_missions_user on public.missions(user_id);
create index if not exists idx_missions_status on public.missions(status);
create index if not exists idx_missions_created on public.missions(created_at desc);

-- Each execution of a mission step
create table if not exists public.mission_runs (
  id          uuid primary key default gen_random_uuid(),
  mission_id  uuid not null references public.missions(id) on delete cascade,
  action_id   text not null,
  status      text not null default 'pending',
  input       jsonb not null default '{}',
  output      jsonb not null default '{}',
  error       text,
  latency_ms  int,
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_mission_runs_mission on public.mission_runs(mission_id);

-- RLS
alter table public.missions enable row level security;
alter table public.mission_runs enable row level security;

create policy missions_select_auth on public.missions for select to authenticated using (true);
create policy missions_insert_auth on public.missions for insert to authenticated with check (true);
create policy missions_update_auth on public.missions for update to authenticated using (true) with check (true);
create policy missions_delete_auth on public.missions for delete to authenticated using (true);

create policy mission_runs_select_auth on public.mission_runs for select to authenticated using (true);
create policy mission_runs_insert_auth on public.mission_runs for insert to authenticated with check (true);
create policy mission_runs_update_auth on public.mission_runs for update to authenticated using (true) with check (true);
