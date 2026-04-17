-- ============================================================
-- Hearst Agents v9 — Applied Change Tracking
-- Audit trail for every decision applied to the system
-- ============================================================

create table public.applied_changes (
  id           uuid primary key default gen_random_uuid(),
  signal_id    uuid references public.improvement_signals(id) on delete set null,
  change_type  text not null
    check (change_type in ('guard_policy', 'cost_budget', 'model_switch', 'tool_config', 'agent_config', 'prompt_update')),
  target_id    text not null,
  target_type  text not null
    check (target_type in ('agent', 'tool', 'integration', 'workflow', 'model_profile')),
  before_value jsonb not null default '{}',
  after_value  jsonb not null default '{}',
  actor        text not null default 'system',
  reason       text,
  created_at   timestamptz not null default now()
);

create index idx_applied_changes_target on public.applied_changes(target_type, target_id);
create index idx_applied_changes_signal on public.applied_changes(signal_id);
create index idx_applied_changes_type on public.applied_changes(change_type);

-- RLS
alter table public.applied_changes enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['applied_changes']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select_auth', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (true)',
      t || '_insert_auth', t
    );
  end loop;
end $$;
