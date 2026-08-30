-- Phase 1: the full product model — Shopify-shaped fields, multiple images,
-- variants, and collections.
--
-- KEY DECISION: products.price_paise and products.stock become DERIVED values
-- (lowest variant price, total variant stock), maintained by a trigger. The
-- variant is the authoritative thing that gets charged; the product row keeps a
-- display price so the catalogue query, the ACP feed and the agent's search stay
-- simple and fast. Nothing outside this file needs to know variants exist unless
-- it is actually taking money.

-- ---- products: the rest of the Shopify field set ----
ALTER TABLE products
  ADD COLUMN status                TEXT    NOT NULL DEFAULT 'active',
  ADD COLUMN product_type          TEXT    NOT NULL DEFAULT '',
  ADD COLUMN vendor                TEXT    NOT NULL DEFAULT '',
  ADD COLUMN tags                  TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN compare_at_paise      BIGINT,
  ADD COLUMN cost_paise            BIGINT,
  ADD COLUMN track_inventory       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN sell_when_out_of_stock BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN physical              BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN weight_grams          INT     NOT NULL DEFAULT 0,
  ADD COLUMN country_of_origin     TEXT    NOT NULL DEFAULT '',
  ADD COLUMN hs_code               TEXT    NOT NULL DEFAULT '',
  ADD COLUMN seo_title             TEXT    NOT NULL DEFAULT '',
  ADD COLUMN seo_description       TEXT    NOT NULL DEFAULT '',
  -- [{ name: 'Size', values: ['S','M','L'] }, ...]
  ADD COLUMN options               JSONB   NOT NULL DEFAULT '[]';

ALTER TABLE products ADD CONSTRAINT products_status_chk CHECK (status IN ('active', 'draft'));
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_tags ON products USING gin (tags);

-- ---- media: many images per product ----
CREATE TABLE product_images (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  alt        TEXT NOT NULL DEFAULT '',
  position   INT  NOT NULL DEFAULT 0
);
CREATE INDEX idx_product_images ON product_images(product_id, position);

-- Carry the existing single image across as image #1.
INSERT INTO product_images(product_id, url, position)
SELECT id, image, 0 FROM products WHERE image <> '';

-- ---- variants: the thing that actually gets bought ----
CREATE TABLE product_variants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  title            TEXT NOT NULL DEFAULT 'Default',
  option_values    JSONB NOT NULL DEFAULT '{}',   -- { Size: 'M', Color: 'Blue' }
  price_paise      BIGINT NOT NULL CHECK (price_paise >= 0),
  compare_at_paise BIGINT,
  sku              TEXT NOT NULL DEFAULT '',
  barcode          TEXT NOT NULL DEFAULT '',
  stock            INT  NOT NULL DEFAULT 0,
  weight_grams     INT  NOT NULL DEFAULT 0,
  image_url        TEXT NOT NULL DEFAULT '',
  position         INT  NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_variants_product ON product_variants(product_id, position);
CREATE UNIQUE INDEX idx_variants_sku ON product_variants(sku) WHERE sku <> '';

-- Every existing product gets a default variant, so single-variant products
-- behave exactly as they did before.
INSERT INTO product_variants(product_id, title, price_paise, stock, image_url)
SELECT id, 'Default', price_paise, stock, image FROM products;

-- ---- keep the product's display price/stock in step with its variants ----
CREATE OR REPLACE FUNCTION sync_product_rollup() RETURNS TRIGGER AS $$
DECLARE pid UUID;
BEGIN
  pid := COALESCE(NEW.product_id, OLD.product_id);
  UPDATE products p SET
    price_paise = COALESCE((SELECT MIN(price_paise) FROM product_variants WHERE product_id = pid), p.price_paise),
    stock       = COALESCE((SELECT SUM(stock)       FROM product_variants WHERE product_id = pid), 0)
  WHERE p.id = pid;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_variant_rollup
AFTER INSERT OR UPDATE OF price_paise, stock OR DELETE ON product_variants
FOR EACH ROW EXECUTE FUNCTION sync_product_rollup();

-- ---- collections ----
CREATE TABLE collections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  handle      TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_collections_handle ON collections(merchant_id, handle);

CREATE TABLE collection_products (
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position      INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, product_id)
);
CREATE INDEX idx_collection_products ON collection_products(product_id);

-- ---- the cutover: cart lines reference a VARIANT, not a product ----
ALTER TABLE cart_items ADD COLUMN variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE;

-- Backfill every existing line to its product's default (only) variant.
UPDATE cart_items ci SET variant_id = v.id
  FROM product_variants v
 WHERE v.product_id = ci.product_id AND ci.variant_id IS NULL;

-- Any line whose product vanished can't be repaired; drop it rather than
-- leaving an unbuyable row in someone's cart.
DELETE FROM cart_items WHERE variant_id IS NULL;

ALTER TABLE cart_items ALTER COLUMN variant_id SET NOT NULL;
ALTER TABLE cart_items DROP CONSTRAINT cart_items_pkey;
ALTER TABLE cart_items ADD PRIMARY KEY (cart_id, variant_id);
CREATE INDEX idx_cart_items_product ON cart_items(product_id);

-- ---- missing indexes on hot paths (flagged in the hardening audit) ----
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_carts_user_status ON carts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);
