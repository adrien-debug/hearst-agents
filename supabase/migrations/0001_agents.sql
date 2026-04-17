-- Table agents pour Hearst (à appliquer dans Supabase SQL Editor ou via CLI Supabase)
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.agents enable row level security;

create policy "agents_select_anon"
  on public.agents
  for select
  to anon
  using (true);

create policy "agents_select_authenticated"
  on public.agents
  for select
  to authenticated
  using (true);
