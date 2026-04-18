ALTER TABLE user_tokens
  ADD COLUMN IF NOT EXISTS tenant_id text;

CREATE INDEX IF NOT EXISTS idx_user_tokens_tenant ON user_tokens(tenant_id) WHERE tenant_id IS NOT NULL;
