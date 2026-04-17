-- ============================================================
-- Hearst Agents v8 — Decision Layer: Improvement Signals
-- Persistent, historized, actionable feedback
-- ============================================================

create table public.improvement_signals (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null
    check (kind in ('agent_config', 'prompt_tuning', 'guard_policy', 'tool_replacement', 'cost_optimization', 'reliability_alert')),
  priority     text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  status       text not null default 'open'
    check (status in ('open', 'acknowledged', 'applied', 'dismissed', 'expired')),
  target_id    text not null,
  target_type  text not null
    check (target_type in ('agent', 'tool', 'integration', 'global')),
  title        text not null,
  description  text not null default '',
  suggestion   text not null default '',
  data         jsonb not null default '{}',
  applied_at   timestamptz,
  applied_by   text,
  resolution   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_improvement_signals_status on public.improvement_signals(status);
create index idx_improvement_signals_target on public.improvement_signals(target_type, target_id);
create index idx_improvement_signals_kind on public.improvement_signals(kind);
create index idx_improvement_signals_priority on public.improvement_signals(priority);

-- RLS
alter table public.improvement_signals enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['improvement_signals']
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
