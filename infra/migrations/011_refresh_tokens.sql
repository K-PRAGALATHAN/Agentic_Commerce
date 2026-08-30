-- Real refresh-token rotation.
--
-- A JWT alone cannot be withdrawn: once signed it is valid until it expires, so
-- "rotation" without a server-side record is cosmetic — the old token keeps
-- working. This table is the record that makes it mean something.
--
-- One live token id per session. Presenting a jti that is not the current one
-- means the token was replayed, which is the classic signal that it leaked, so
-- every session for that user is revoked rather than just the one.
CREATE TABLE refresh_tokens (
  jti        UUID PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_user ON refresh_tokens(user_id) WHERE NOT revoked;
CREATE INDEX idx_refresh_expiry ON refresh_tokens(expires_at);
