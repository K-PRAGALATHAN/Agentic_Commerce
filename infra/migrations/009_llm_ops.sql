-- LLM Ops: the Eval → Gate → Release half.
--
-- Trace and Observe already existed (agent_runs carries latency and status,
-- model_cost carries tokens and rupees). What was missing is the part that
-- decides whether a change is safe to ship: scored evals, and prompt versions
-- that are only promoted once those evals pass.

-- A prompt is a behaviour change with no compiler. Versioning it by content hash
-- means a trace can say exactly which text produced a given run.
CREATE TABLE prompt_versions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,              -- customer | merchant | summarizer
  version    TEXT NOT NULL,              -- first 8 of sha256(body)
  body       TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT false,
  passed     BOOLEAN,                    -- null = never evaluated
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_prompt_versions ON prompt_versions(name, version);
-- Only one active version per prompt — the Release gate.
CREATE UNIQUE INDEX idx_prompt_active ON prompt_versions(name) WHERE active;

-- One row per golden case per eval run.
CREATE TABLE agent_evals (
  id             BIGSERIAL PRIMARY KEY,
  suite_id       TEXT NOT NULL,          -- one id per full run of the set
  case_id        TEXT NOT NULL,
  prompt_name    TEXT NOT NULL DEFAULT '',
  prompt_version TEXT NOT NULL DEFAULT '',
  passed         BOOLEAN NOT NULL,
  score          NUMERIC(4,2),           -- 0..1 from the judge, null if not judged
  expected       TEXT NOT NULL DEFAULT '',
  actual         TEXT NOT NULL DEFAULT '',
  detail         TEXT NOT NULL DEFAULT '',
  latency_ms     INT,
  ts             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_evals_suite ON agent_evals(suite_id, ts DESC);
