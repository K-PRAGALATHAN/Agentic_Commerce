-- Phase 5 stores: knowledge graph, wiki, persistent agent memory.

-- Knowledge graph edges (materialized from orders). BOUGHT_WITH is the main edge;
-- COMPLEMENTS/IN_CLUSTER can be added later. Directed src -> dst with a weight.
CREATE TABLE kg_edges (
  src_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  dst_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type   TEXT NOT NULL DEFAULT 'BOUGHT_WITH',
  weight INT  NOT NULL DEFAULT 1,
  PRIMARY KEY (src_id, dst_id, type)
);
CREATE INDEX idx_kg_src ON kg_edges(src_id, type, weight DESC);

-- Wiki: shared store/product knowledge for AGENT CONSISTENCY (policies, facts).
CREATE TABLE wiki (
  key        TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO wiki(key, title, content) VALUES
  ('returns',  'Returns policy',  'Items can be returned within 7 days of delivery. Refunds require merchant approval and are processed to the original payment method.'),
  ('shipping', 'Shipping',        'Orders ship in 2-4 business days. Delivery timelines depend on your location.'),
  ('payments', 'Payments',        'Payments are processed securely via Razorpay. This is a test environment — no real money moves. Agents can spend only within your configured spend limit.'),
  ('about',    'About the store', 'An AI-first store: an assistant can search, recommend, and buy on your behalf, always within your spend limit and with a full audit trail.');

-- Persistent per-user agent memory (Sidekick-style; survives restarts).
CREATE TABLE agent_memory (
  id      BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role    TEXT NOT NULL,
  content TEXT NOT NULL,
  ts      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_memory_user ON agent_memory(user_id, id DESC);
