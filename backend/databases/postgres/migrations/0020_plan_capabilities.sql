-- 0020_plan_capabilities.sql
-- Adds included_capabilities to subscription_plans -- the data side of
-- the new Entitlement Engine (Platform-Services/Entitlements): a plan
-- now grants a set of gated features (e.g. "ai_chat"), not just numeric
-- quotas and channel access. See CUTOVER.md and
-- Platform-Services/Subscriptions/src/types.ts's Capability doc comment.

BEGIN;

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS included_capabilities JSONB NOT NULL DEFAULT '[]';

COMMIT;
