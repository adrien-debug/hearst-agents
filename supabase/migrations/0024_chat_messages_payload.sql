-- Migration 0024: chat_messages payload + tool role
--
-- Adds a JSONB `payload` column for storing the full ModelMessage (with
-- structured tool-call and tool-result parts) emitted by the AI SDK.
-- Drops the role check constraint so we can store 'tool' messages too.
--
-- Backward compatible: existing rows have payload = NULL and continue to be
-- read via the text fallback. New rows are written with payload populated.

alter table public.chat_messages
  add column if not exists payload jsonb;

-- Drop the existing role check (created in 0023) so we can store 'tool' role
-- messages alongside 'user'/'assistant'.
alter table public.chat_messages
  drop constraint if exists chat_messages_role_check;
