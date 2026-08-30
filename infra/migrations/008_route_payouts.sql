-- Phase 2: money reaches the merchant.
--
-- Razorpay Route splits a payment across linked accounts. Route may not be
-- enabled on a given test account, so every transfer is ALSO recorded locally.
-- With Route on, razorpay_transfer_id is set; with Route off, the row still
-- exists with a null id and the merchant's payout balance is still correct.
-- The merchant's revenue figure is truthful in both modes.

CREATE TABLE linked_accounts (
  merchant_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  razorpay_account_id TEXT,
  business_name       TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'pending',  -- pending | active | unavailable
  detail              TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transfers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  merchant_id          UUID NOT NULL REFERENCES users(id),
  amount_paise         BIGINT NOT NULL CHECK (amount_paise >= 0),
  razorpay_transfer_id TEXT,                              -- null => recorded locally only
  status               TEXT NOT NULL DEFAULT 'pending',   -- pending | processed | settled | failed
  mode                 TEXT NOT NULL DEFAULT 'ledger',    -- route | ledger
  detail               TEXT NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_transfers_merchant ON transfers(merchant_id, created_at DESC);
-- One transfer per merchant per order: replaying a webhook must not pay twice.
CREATE UNIQUE INDEX idx_transfers_order_merchant ON transfers(order_id, merchant_id);
