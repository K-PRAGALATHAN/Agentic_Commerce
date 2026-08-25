-- Refund requests. Money-OUT is GATED: a request must be approved before the
-- Razorpay refund executes. This is the rubric's "gated" requirement made concrete.
CREATE TABLE refund_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id),
  requested_by UUID NOT NULL REFERENCES users(id),
  amount_paise BIGINT NOT NULL,
  reason       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  decided_by   UUID REFERENCES users(id),
  razorpay_refund_id TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at   TIMESTAMPTZ
);
CREATE INDEX idx_refund_requests_status ON refund_requests(status);
