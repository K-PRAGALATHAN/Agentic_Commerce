-- Discounts: the merchant's lever for the revenue-growth agent.
-- Applied inside checkout() BEFORE the guardrail, so the spend limit is always
-- checked against the amount actually charged, never the pre-discount total.
CREATE TABLE discounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'percent',   -- percent | fixed
  value           INT  NOT NULL CHECK (value > 0),   -- percent points, or paise
  active          BOOLEAN NOT NULL DEFAULT true,
  automatic       BOOLEAN NOT NULL DEFAULT false,    -- applies without a code
  min_order_paise BIGINT NOT NULL DEFAULT 0,
  usage_limit     INT,                               -- null = unlimited
  used_count      INT  NOT NULL DEFAULT 0,
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT discounts_kind_chk CHECK (kind IN ('percent', 'fixed')),
  CONSTRAINT discounts_percent_chk CHECK (kind <> 'percent' OR value <= 100)
);
CREATE UNIQUE INDEX idx_discounts_code ON discounts(upper(code));
CREATE INDEX idx_discounts_merchant ON discounts(merchant_id);

-- What a given order actually had applied, so revenue can be reconciled later.
ALTER TABLE orders
  ADD COLUMN discount_id     UUID REFERENCES discounts(id),
  ADD COLUMN discount_paise  BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN subtotal_paise  BIGINT NOT NULL DEFAULT 0;

-- Existing orders had no discount, so subtotal == total.
UPDATE orders SET subtotal_paise = total_paise WHERE subtotal_paise = 0;
