-- Migration 0040 : Custom Webhooks
-- Permet aux tenants de configurer des webhooks déclenchés sur des événements produit.

create table public.custom_webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  url text not null,
  secret text,                                  -- HMAC signing secret (optionnel)
  events text[] not null,                       -- ["report.generated", "mission.completed", ...]
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_triggered_at timestamptz,
  last_status text                              -- "success" | "failed" | null
);

create index on public.custom_webhooks(tenant_id, active);

alter table public.custom_webhooks enable row level security;

create policy "tenant_isolation" on public.custom_webhooks
  for all using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
