ALTER TABLE user_tokens
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS auth_failure_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS refresh_rotated_at timestamptz;
