-- Daily Reports Registry
-- Découple "rapport produit" du "run technique"
create table if not exists daily_reports (
  id            uuid primary key default gen_random_uuid(),
  report_date   date not null,
  report_type   text not null default 'crypto_daily',
  workflow_id   uuid references workflows(id),
  run_id        uuid references runs(id),
  status        text not null default 'pending'
                check (status in ('pending','running','completed','failed','skipped')),
  content_markdown text,
  summary       text,
  highlights    jsonb default '[]'::jsonb,
  error_message text,
  idempotency_decision text,
  triggered_by  text not null default 'cron',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Un seul rapport réussi par date+type
create unique index if not exists uq_daily_reports_date_type
  on daily_reports(report_date, report_type)
  where status = 'completed';

create index if not exists idx_daily_reports_date on daily_reports(report_date desc);
create index if not exists idx_daily_reports_status on daily_reports(status);
create index if not exists idx_daily_reports_run on daily_reports(run_id);
