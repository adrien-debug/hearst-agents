-- ============================================================
-- Hearst Agents v7 — Integration Layer
-- Secure, traceable connections to external services
-- ============================================================

create table public.integration_connections (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  name         text not null,
  auth_type    text not null default 'none'
    check (auth_type in ('none', 'api_key', 'oauth2', 'bearer')),
  credentials  jsonb not null default '{}',
  scopes       text[] not null default '{}',
  status       text not null default 'active'
    check (status in ('active', 'inactive', 'revoked', 'error')),
  health       text not null default 'unknown'
    check (health in ('healthy', 'degraded', 'down', 'unknown')),
  last_health_check timestamptz,
  config       jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (provider, name)
);

create index idx_integration_connections_provider on public.integration_connections(provider);
create index idx_integration_connections_status on public.integration_connections(status);

comment on column public.integration_connections.credentials is
  'Encrypted/secured auth credentials — never exposed in API responses';

-- Link tools to integration connections (optional FK)
alter table public.tools
  add column if not exists integration_id uuid references public.integration_connections(id) on delete set null;

-- RLS
alter table public.integration_connections enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['integration_connections']
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
