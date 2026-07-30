-- 0023_events.sql
-- Event bus (Command Center as the hub): a durable, append-only log of
-- events published by any service-account-authenticated caller,
-- retrievable by anyone who wants to subscribe. Deliberately NOT a
-- message broker -- this is intentionally the lightest thing that could
-- work at two publishers/subscribers (today: Aegis publishes, Command
-- Center's own staff tooling can read), sized to grow cleanly to a
-- handful more without a rewrite, not to replace Kafka/RabbitMQ if this
-- product ever needs that scale. See EVENTS.md at the repo root for the
-- full envelope contract and reasoning.
--
-- event_id is the PUBLISHER's own idempotency key (a UUID it generates
-- when the event is created, before it's ever sent) -- distinct from
-- this table's own `id`. A publisher retrying a delivery that actually
-- succeeded but whose response was lost (network blip) sends the same
-- event_id again; publishEvent treats that as a no-op rather than
-- recording a duplicate.

BEGIN;

CREATE TABLE IF NOT EXISTS events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Strictly monotonic, gap-tolerant insert order -- the actual cursor
    -- subscribers page against. received_at (even at Postgres's
    -- microsecond timestamptz precision) can theoretically tie between
    -- two fast concurrent inserts; a cursor built on a value that can
    -- tie can silently drop an event from a subscriber's "since my last
    -- cursor" query forever. sequence can't tie -- BIGSERIAL guarantees
    -- strictly increasing values even under concurrent writers.
    sequence      BIGSERIAL NOT NULL UNIQUE,
    event_id      TEXT NOT NULL UNIQUE,
    type          TEXT NOT NULL,
    source        TEXT NOT NULL,
    occurred_at   TIMESTAMPTZ NOT NULL,
    payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
    received_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Subscribers poll "everything after my last sequence cursor" -- this
-- index serves that query. received_at/type stay indexed too for
-- coarser, non-pagination lookups (e.g. staff tooling browsing recent
-- events by type).
CREATE INDEX IF NOT EXISTS idx_events_sequence ON events(sequence);
CREATE INDEX IF NOT EXISTS idx_events_received_at ON events(received_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

COMMIT;
