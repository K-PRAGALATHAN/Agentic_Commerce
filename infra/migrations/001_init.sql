-- Phase 0 schema: all core tables (some filled in later phases).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---- Auth: users, roles (RBAC), attributes (ABAC) ----
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id   SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);
INSERT INTO roles(name) VALUES ('customer'), ('merchant'), ('admin');

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INT  NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE user_attributes (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  value   JSONB NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- ---- Catalog (two doors write here; one read path) ----
CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   TEXT,                       -- Door 1: fetched source id
  merchant_id UUID REFERENCES users(id),  -- Door 2: owning merchant
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_paise BIGINT NOT NULL CHECK (price_paise >= 0),
  stock       INT NOT NULL DEFAULT 0,
  category    TEXT NOT NULL DEFAULT 'general',
  rating      NUMERIC(3,2) NOT NULL DEFAULT 0,
  image       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_name ON products USING gin (to_tsvector('english', name));
-- Door-1 seed upserts key on source_id; merchant (Door-2) products have NULL source_id.
CREATE UNIQUE INDEX idx_products_source ON products(source_id) WHERE source_id IS NOT NULL;

-- ---- Cart ----
CREATE TABLE carts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE cart_items (
  cart_id     UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id),
  qty         INT NOT NULL CHECK (qty > 0),
  price_paise BIGINT NOT NULL,
  PRIMARY KEY (cart_id, product_id)
);

-- ---- Orders + payments ----
CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  total_paise       BIGINT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'created',
  razorpay_order_id TEXT,
  items             JSONB NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id),
  razorpay_payment_id TEXT,
  status              TEXT NOT NULL,
  verified            BOOLEAN NOT NULL DEFAULT false,
  amount_paise        BIGINT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Observability: audit + hash-chained ledgers + agent runs + model cost ----
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  target      TEXT,
  amount_paise BIGINT,
  reason      TEXT NOT NULL,
  verified    BOOLEAN,
  run_id      TEXT,
  ts          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE intent_ledger (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id),
  prev_hash      TEXT NOT NULL,
  payload        JSONB NOT NULL,
  limit_snapshot JSONB NOT NULL,
  ts             TIMESTAMPTZ NOT NULL DEFAULT now(),
  hash           TEXT NOT NULL
);

CREATE TABLE checkout_ledger (
  id        BIGSERIAL PRIMARY KEY,
  user_id   UUID NOT NULL REFERENCES users(id),
  prev_hash TEXT NOT NULL,
  payload   JSONB NOT NULL,
  ts        TIMESTAMPTZ NOT NULL DEFAULT now(),
  hash      TEXT NOT NULL
);

CREATE TABLE agent_runs (
  id      BIGSERIAL PRIMARY KEY,
  run_id  TEXT NOT NULL,
  agent   TEXT NOT NULL,
  input   JSONB,
  output  JSONB,
  status  TEXT NOT NULL DEFAULT 'ok',
  ts      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE model_cost (
  id          BIGSERIAL PRIMARY KEY,
  merchant_id UUID,
  run_id      TEXT,
  model       TEXT,
  tokens_in   INT,
  tokens_out  INT,
  cost        NUMERIC(12,6),
  ts          TIMESTAMPTZ NOT NULL DEFAULT now()
);
