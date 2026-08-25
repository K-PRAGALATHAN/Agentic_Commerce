-- Password reset tokens. We store only a HASH of the token (never the raw token),
-- the same principle as passwords: a leaked table must not reveal a usable secret.
CREATE TABLE password_resets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_password_resets_token ON password_resets(token_hash);
