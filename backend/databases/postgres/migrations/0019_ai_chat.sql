-- 0019_ai_chat.sql
-- Foundation for the "true Aegis AI" escalation path
-- (Customer-Connections/AIChat). Genuinely new, not migrated -- see
-- CUTOVER.md and src/types.ts.

BEGIN;

CREATE TABLE IF NOT EXISTS ai_chat_conversations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    device_id         UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    status            TEXT NOT NULL CHECK (status IN ('active', 'closed')),
    started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Supports getActiveConversationForDevice's lookup exactly: most
-- recent active conversation for a given device.
CREATE INDEX IF NOT EXISTS idx_ai_chat_conv_device_active ON ai_chat_conversations(device_id, status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   UUID NOT NULL REFERENCES ai_chat_conversations(id) ON DELETE CASCADE,
    role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content           TEXT NOT NULL,
    tokens_used       INTEGER,
    model             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_conversation ON ai_chat_messages(conversation_id, created_at);

COMMIT;
