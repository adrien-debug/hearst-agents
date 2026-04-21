CREATE TABLE IF NOT EXISTS user_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  provider text NOT NULL DEFAULT 'google',
  access_token_enc text,
  refresh_token_enc text,
  expires_at bigint DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, provider)
);

create index IF NOT EXISTS idx_user_tokens_user_provider ON user_tokens(user_id, provider);

ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON user_tokens
  FOR ALL
  USING (true)
  WITH CHECK (true);
