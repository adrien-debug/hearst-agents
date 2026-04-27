-- Migration 0023: chat_messages
--
-- Persistent conversation memory for the v2 AI pipeline.
-- Independent of the legacy conversations/messages schema (which requires
-- agent_id FKs). This table is keyed by conversation_id (= thread_id from
-- the client) and user_id for multi-tenant isolation.

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  user_id         text not null,
  tenant_id       text not null default 'dev-tenant',
  workspace_id    text not null default 'dev-workspace',
  role            text not null check (role in ('user', 'assistant')),
  content         text not null default '',
  created_at      timestamptz not null default now()
);

create index if not exists idx_chat_messages_conversation
  on public.chat_messages (conversation_id, created_at);

create index if not exists idx_chat_messages_user
  on public.chat_messages (user_id, created_at);

alter table public.chat_messages enable row level security;

-- Service role bypasses RLS (server-side only access)
create policy "service_role_all" on public.chat_messages
  for all
  to service_role
  using (true)
  with check (true);
