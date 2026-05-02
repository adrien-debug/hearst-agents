-- 0058_simulation_runs.sql
-- Sprint 2.2 — SimulationStage Pipeline
--
-- Table dédiée pour persister les runs de simulation DeepSeek R1
-- (3-5 scenarios chiffrés avec probabilités).
-- Couplée avec assets (kind='report' ou nouveau kind='simulation_run')
-- pour exposer le résultat dans la timeline.

create table if not exists simulation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  tenant_id text not null,
  /** Run ID de la conversation parent qui a déclenché la simulation. */
  parent_run_id text,
  /** Description user du scénario. */
  scenario_input text not null,
  /** Variables clés (budget, timeline, etc.) — JSONB array. */
  variables jsonb not null default '[]'::jsonb,
  status text not null check (status in ('pending', 'streaming', 'completed', 'failed')),
  /** Reasoning chain DeepSeek (streaming chunks accumulés). */
  reasoning text,
  /** Scenarios validés Zod (array of SimulationScenario). */
  scenarios jsonb,
  /** Asset persisté (markdown formatté) si la simulation a complété. */
  asset_id uuid,
  /** Message d'erreur si status === 'failed'. */
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Index pour history listing par user
create index if not exists idx_simulation_runs_user_created
  on simulation_runs(user_id, tenant_id, created_at desc);

-- RLS
alter table simulation_runs enable row level security;

drop policy if exists simulation_runs_user_isolation on simulation_runs;
create policy simulation_runs_user_isolation
  on simulation_runs
  for all
  using (user_id = current_setting('app.current_user_id', true));
