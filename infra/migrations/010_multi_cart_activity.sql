-- Phase 4: multiple carts, and a storefront that reflects what the user does.

-- ---- Multiple named carts, Amazon-style, with one universal default ----
ALTER TABLE carts
  ADD COLUMN name       TEXT    NOT NULL DEFAULT 'Universal cart',
  ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT false;

-- Exactly one default per user: anything added without a named target lands here.
CREATE UNIQUE INDEX idx_carts_one_default ON carts(user_id) WHERE is_default AND status = 'active';

-- Adopt each user's existing active cart as their universal one. Picking the
-- oldest keeps the cart people have actually been using, rather than a stray
-- empty one created by a later request.
WITH first_cart AS (
  SELECT DISTINCT ON (user_id) id FROM carts
   WHERE status = 'active' ORDER BY user_id, created_at
)
UPDATE carts SET is_default = true, name = 'Universal cart'
 WHERE id IN (SELECT id FROM first_cart);

-- ---- Activity: what the customer looked at ----
-- Powers the "Continue browsing" row and gives recommendations something to work
-- from before a customer has ever bought anything.
CREATE TABLE product_views (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_views_user ON product_views(user_id, ts DESC);

-- Which cart an order came from, so a verified payment clears only that one.
ALTER TABLE orders ADD COLUMN cart_id UUID REFERENCES carts(id);
