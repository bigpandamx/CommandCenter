-- 0038_compliance_source_management.sql
-- Two additions for the Source Management admin surface:
--
-- 1. schedule_interval_minutes -- staff-editable, but purely metadata
-- for now. The compliance scheduler (scheduler.ts/schedulerRunner.ts)
-- already documents itself as "not built as an actual cron job" --
-- this column lets staff record their intent (e.g. "check Federal
-- Register every 60 minutes") without pretending a real per-source
-- cron exists to honor it yet. Same "honestly scoped" convention as
-- Service.usageMeterKey: stored, surfaced, not silently enforced.
--
-- 2. 'manual' added to source_type's allowed values -- a source with
-- no automated fetch adapter at all, for regulatory bodies (ISO,
-- certain state regulators) that don't publish a machine-readable
-- feed. Staff add updates to a manual source by hand rather than via
-- scheduled ingestion; the scheduler skips manual sources entirely
-- (see scheduler.ts's adapterFor).

BEGIN;

ALTER TABLE compliance_sources
    ADD COLUMN IF NOT EXISTS schedule_interval_minutes INTEGER;

ALTER TABLE compliance_sources DROP CONSTRAINT IF EXISTS compliance_sources_source_type_check;
ALTER TABLE compliance_sources ADD CONSTRAINT compliance_sources_source_type_check
    CHECK (source_type IN ('rss', 'atom', 'json_api', 'manual'));

COMMIT;
