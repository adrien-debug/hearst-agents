-- ============================================================
-- HEARST OS - Database Cleanup & Model Profiles Setup
-- Run this in Supabase SQL Editor: https://jnijwpqbanazuapznrzu.supabase.co
-- ============================================================

-- ============================================================
-- STEP 1: Model Profiles - Insert/Update all LLM providers
-- ============================================================

-- 1. ANTHROPIC Claude 3.5 Sonnet (primary orchestrator backend)
insert into public.model_profiles (
  id, name, provider, model, temperature, max_tokens, top_p,
  fallback_profile_id, cost_per_1k_in, cost_per_1k_out, max_cost_per_run,
  is_default, metadata
)
values (
  'a1e2f3a4-b5c6-4789-a012-000000000010',
  'anthropic_claude_35_sonnet',
  'anthropic',
  'claude-3-5-sonnet-20241022',
  0.7,
  8192,
  1.0,
  null,
  0.003,
  0.015,
  1.0,
  true,
  '{"family":"claude-3.5-sonnet","use_case":"orchestrator_primary"}'::jsonb
)
on conflict (name) do update set
  provider = excluded.provider,
  model = excluded.model,
  temperature = excluded.temperature,
  max_tokens = excluded.max_tokens,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  is_default = excluded.is_default,
  metadata = excluded.metadata;

-- 2. OPENAI GPT-4o (high quality)
insert into public.model_profiles (
  id, name, provider, model, temperature, max_tokens, top_p,
  fallback_profile_id, cost_per_1k_in, cost_per_1k_out, max_cost_per_run,
  is_default, metadata
)
values (
  'a1e2f3a4-b5c6-4789-a012-000000000020',
  'openai_gpt4o',
  'openai',
  'gpt-4o',
  0.7,
  4096,
  1.0,
  null,
  0.005,
  0.015,
  1.0,
  false,
  '{"family":"gpt-4o","use_case":"high_quality"}'::jsonb
)
on conflict (name) do update set
  provider = excluded.provider,
  model = excluded.model,
  temperature = excluded.temperature,
  max_tokens = excluded.max_tokens,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  metadata = excluded.metadata;

-- 3. OPENAI GPT-4o-mini (cost effective)
insert into public.model_profiles (
  id, name, provider, model, temperature, max_tokens, top_p,
  fallback_profile_id, cost_per_1k_in, cost_per_1k_out, max_cost_per_run,
  is_default, metadata
)
values (
  'a1e2f3a4-b5c6-4789-a012-000000000021',
  'openai_gpt4o_mini',
  'openai',
  'gpt-4o-mini',
  0.7,
  4096,
  1.0,
  null,
  0.00015,
  0.0006,
  0.1,
  false,
  '{"family":"gpt-4o-mini","use_case":"cost_effective"}'::jsonb
)
on conflict (name) do update set
  provider = excluded.provider,
  model = excluded.model,
  temperature = excluded.temperature,
  max_tokens = excluded.max_tokens,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  metadata = excluded.metadata;

-- 4. GEMINI 3 Flash (fast fallback)
insert into public.model_profiles (
  id, name, provider, model, temperature, max_tokens, top_p,
  fallback_profile_id, cost_per_1k_in, cost_per_1k_out, max_cost_per_run,
  is_default, metadata
)
values (
  'a1e2f3a4-b5c6-4789-a012-000000000002',
  'gemini_3_flash_leaf',
  'gemini',
  'gemini-3-flash-preview',
  1.0,
  8192,
  0.95,
  null,
  0.0005,
  0.003,
  null,
  false,
  '{"family":"gemini-3-flash","use_case":"fast_fallback"}'::jsonb
)
on conflict (name) do update set
  provider = excluded.provider,
  model = excluded.model,
  temperature = excluded.temperature,
  max_tokens = excluded.max_tokens,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  metadata = excluded.metadata;

-- ============================================================
-- STEP 2: Setup Fallback Chains
-- ============================================================

-- Claude → GPT-4o → Gemini Flash
update public.model_profiles
set fallback_profile_id = 'a1e2f3a4-b5c6-4789-a012-000000000020'
where name = 'anthropic_claude_35_sonnet';

update public.model_profiles
set fallback_profile_id = 'a1e2f3a4-b5c6-4789-a012-000000000002'
where name = 'openai_gpt4o';

-- ============================================================
-- STEP 3: Cleanup Old/Stuck Data
-- ============================================================

-- Fix runs stuck in 'running' for >24h
update public.runs
set status = 'failed',
    error = 'Auto-cleanup: run timed out after 24h',
    finished_at = now()
where status = 'running'
  and started_at < now() - interval '24 hours';

-- Delete orphaned traces
delete from public.traces
where run_id not in (select id from public.runs);

-- Delete old completed runs (keep 30 days, keep parents for replay chain)
delete from public.runs
where status = 'completed'
  and created_at < now() - interval '30 days'
  and id not in (
    select distinct parent_run_id from public.runs where parent_run_id is not null
  );

-- Delete orphaned assets
delete from public.assets
where run_id not in (select id from public.runs)
  and created_at < now() - interval '7 days';

-- ============================================================
-- STEP 4: Verification
-- ============================================================

select 'MODEL PROFILES' as section;
select id, name, provider, model, fallback_profile_id, is_default
from public.model_profiles
order by provider, name;

select 'RUNS SUMMARY' as section;
select status, count(*) as count
from public.runs
group by status
order by count desc;
