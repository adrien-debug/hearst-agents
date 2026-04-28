-- Migration 0025: report cache (3 tiers)
--
-- Foundation pour le système de reports cross-app. Trois tables purement
-- dérivées (peuvent être vidées à tout moment) qui mettent en cache :
--
--   1. report_source_cache      — résultat brut d'un fetch source
--                                 (Composio action, Google API, HTTP, asset).
--                                 TTL court (60s pour Stripe, 5min Gmail/HubSpot).
--
--   2. report_transform_cache   — résultat d'une opération de transformation
--                                 (filter, join, groupBy, window, ...).
--                                 TTL = 10× L1 typique.
--
--   3. report_render_cache      — payload JSON final prêt à rendre dans le focal,
--                                 + narration LLM associée. Clé composite par
--                                 (spec_id, version, payload_hash) pour invalider
--                                 automatiquement quand le Spec change de version
--                                 ou que les données amont mutent.
--
-- Pas d'index complexes — (hash) PK suffit, plus un btree sur expires_at pour le
-- cleanup périodique (cron).

create table if not exists public.report_source_cache (
  hash text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists report_source_cache_expires_at_idx
  on public.report_source_cache (expires_at);

create table if not exists public.report_transform_cache (
  hash text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists report_transform_cache_expires_at_idx
  on public.report_transform_cache (expires_at);

create table if not exists public.report_render_cache (
  spec_id uuid not null,
  version int not null,
  payload_hash text not null,
  payload_json jsonb not null,
  narration text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (spec_id, version, payload_hash)
);

create index if not exists report_render_cache_expires_at_idx
  on public.report_render_cache (expires_at);

create index if not exists report_render_cache_spec_idx
  on public.report_render_cache (spec_id, version);
