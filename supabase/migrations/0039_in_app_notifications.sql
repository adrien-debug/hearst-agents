-- Migration 0039 : Notifications in-app
-- Déclenché par les signaux critiques/warning du pipeline reports.
-- Consommé par le store front-end (polling 30s ou Supabase Realtime).

create table public.in_app_notifications (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  user_id     uuid        references public.users(id) on delete cascade, -- null = toute l'équipe
  kind        text        not null check (kind in ('signal', 'report_ready', 'export_done', 'share_viewed')),
  severity    text        not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title       text        not null,
  body        text,
  meta        jsonb,      -- signal_type, report_id, etc.
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- Index principal : tenant + non-lues en tête, triées par date desc
create index on public.in_app_notifications (tenant_id, read_at nulls first, created_at desc);

-- Index secondaire : requêtes par user spécifique
create index on public.in_app_notifications (tenant_id, user_id, read_at nulls first, created_at desc);

alter table public.in_app_notifications enable row level security;

-- Lecture : membre du tenant
create policy "tenant_read" on public.in_app_notifications
  for select using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Écriture / update (markRead) : membre du tenant
create policy "tenant_write" on public.in_app_notifications
  for all using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
