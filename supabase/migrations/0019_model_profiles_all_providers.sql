-- ============================================================
-- Migration 0019: Add all LLM providers to model_profiles
-- Anthropic, OpenAI, Gemini profiles with fallback chains
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
  '{"family":"claude-3.5-sonnet","docs":"https://docs.anthropic.com/claude/docs","use_case":"orchestrator_primary"}'::jsonb
)
on conflict (name) do update set
  provider = excluded.provider,
  model = excluded.model,
  temperature = excluded.temperature,
  max_tokens = excluded.max_tokens,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  metadata = excluded.metadata,
  is_default = excluded.is_default;

-- 2. OPENAI GPT-4o (high quality, vision capable)
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
  '{"family":"gpt-4o","docs":"https://platform.openai.com/docs","use_case":"high_quality","vision":true}'::jsonb
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
  '{"family":"gpt-4o-mini","docs":"https://platform.openai.com/docs","use_case":"cost_effective"}'::jsonb
)
on conflict (name) do update set
  provider = excluded.provider,
  model = excluded.model,
  temperature = excluded.temperature,
  max_tokens = excluded.max_tokens,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  metadata = excluded.metadata;

-- 4. GEMINI 3 Flash (fast, cheap fallback)
-- Update existing if present, or insert
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
  '{"family":"gemini-3-flash","docs":"https://ai.google.dev/gemini-api/docs","use_case":"fast_fallback"}'::jsonb
)
on conflict (name) do update set
  provider = excluded.provider,
  model = excluded.model,
  temperature = excluded.temperature,
  max_tokens = excluded.max_tokens,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  metadata = excluded.metadata;

-- 5. Fallback chain: Claude → GPT-4o → Gemini Flash
-- Update Claude to fallback to GPT-4o
update public.model_profiles
set fallback_profile_id = 'a1e2f3a4-b5c6-4789-a012-000000000020'
where name = 'anthropic_claude_35_sonnet'
  and fallback_profile_id is null;

-- Update GPT-4o to fallback to Gemini Flash
update public.model_profiles
set fallback_profile_id = 'a1e2f3a4-b5c6-4789-a012-000000000002'
where name = 'openai_gpt4o'
  and fallback_profile_id is null;

-- ============================================================
-- Cleanup: Remove old test profiles that may conflict
-- ============================================================

-- Delete any duplicate or test profiles (keep only the ones above)
delete from public.model_profiles
where name not in (
  'anthropic_claude_35_sonnet',
  'openai_gpt4o',
  'openai_gpt4o_mini',
  'gemini_3_flash_leaf',
  'composer_2_with_gemini_fallback'
)
and id not in (
  'a1e2f3a4-b5c6-4789-a012-000000000001' -- keep composer if exists
);

-- ============================================================
-- Verification query (uncomment to run manually)
-- ============================================================
-- select id, name, provider, model, fallback_profile_id, is_default
-- from public.model_profiles
-- order by provider, name;
