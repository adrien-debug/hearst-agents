-- Assets: persistent focal objects produced by the runtime
CREATE TABLE IF NOT EXISTS public.assets (
  id          text PRIMARY KEY,
  thread_id   text NOT NULL,
  run_id      text,
  kind        text NOT NULL CHECK (kind IN ('report','brief','message','document','spreadsheet','task','event')),
  title       text NOT NULL DEFAULT '',
  summary     text,
  content_ref text,
  output_tier text,
  provenance  jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assets_thread ON public.assets (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_run    ON public.assets (run_id);

-- Actions: recorded operations
CREATE TABLE IF NOT EXISTS public.actions (
  id          text PRIMARY KEY,
  thread_id   text NOT NULL,
  type        text NOT NULL,
  provider    text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  timestamp   timestamptz NOT NULL DEFAULT now(),
  metadata    jsonb NOT NULL DEFAULT '{}',
  asset_id    text REFERENCES public.assets(id)
);

CREATE INDEX IF NOT EXISTS idx_actions_thread ON public.actions (thread_id, timestamp DESC);
