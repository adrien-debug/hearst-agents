-- Seed model_profiles for Composer 2 → Gemini 3 Flash fallback chain.
-- IDs are fixed so app code / tests can reference them if needed.

insert into public.model_profiles (
  id,
  name,
  provider,
  model,
  temperature,
  max_tokens,
  top_p,
  fallback_profile_id,
  cost_per_1k_in,
  cost_per_1k_out,
  max_cost_per_run,
  is_default,
  metadata
)
values
  (
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
    '{"family":"gemini-3-flash","docs":"https://ai.google.dev/gemini-api/docs/gemini-3"}'::jsonb
  ),
  (
    'a1e2f3a4-b5c6-4789-a012-000000000001',
    'composer_2_with_gemini_fallback',
    'composer',
    'cursor-composer-2',
    0.2,
    8192,
    1.0,
    'a1e2f3a4-b5c6-4789-a012-000000000002',
    0.0005,
    0.0025,
    null,
    false,
    '{"family":"composer-2","docs":"https://cursor.com/docs/models/cursor-composer-2"}'::jsonb
  )
on conflict (name) do nothing;
