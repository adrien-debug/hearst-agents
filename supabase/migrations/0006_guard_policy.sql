-- ============================================================
-- Hearst Agents v6 — Guard Policy Persistence
-- Adds guard_policy jsonb to agents for per-agent output validation rules
-- ============================================================

alter table public.agents
  add column if not exists guard_policy jsonb not null default '{}';

comment on column public.agents.guard_policy is
  'Per-agent output guard policy: expect_json, min/max_output_chars, must_match, must_not_match, blacklist';
