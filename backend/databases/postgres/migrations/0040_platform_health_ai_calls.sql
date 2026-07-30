-- 0040_platform_health_ai_calls.sql
-- Platform Health (Platform-Services/PlatformHealth): the AI call
-- ledger backing both AI Provider Health and Token Usage. One unified
-- record per AI provider call, platform-wide -- see
-- PlatformHealth/src/types.ts's module doc comment for why this is a
-- new, separate table rather than reusing subscriptions' existing
-- usage_records (which only ever captured AI Chat's customer-billed
-- calls, never Compliance's internal AI Analysis calls).
--
-- Internal-only: nothing in this table is customer-facing, and nothing
-- here is billed -- see billing's own usage_records for that, unchanged
-- and untouched by this migration.

BEGIN;

CREATE TABLE IF NOT EXISTS ai_call_records (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context        TEXT NOT NULL,
    success        BOOLEAN NOT NULL,
    -- Null, not 0, when a call failed before a model responded at all --
    -- see AiCallRecord.tokensUsed's own doc comment.
    tokens_used    INTEGER,
    latency_ms     INTEGER NOT NULL,
    model          TEXT NOT NULL,
    error_message  TEXT,
    occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supports listAiCallsSince's two real query shapes: "everything since
-- X" (health/token-usage windows spanning all contexts) and
-- "everything since X for context Y" (a single feature's health).
CREATE INDEX IF NOT EXISTS idx_ai_call_records_occurred_at ON ai_call_records(occurred_at);
CREATE INDEX IF NOT EXISTS idx_ai_call_records_context_occurred_at ON ai_call_records(context, occurred_at);

COMMIT;
