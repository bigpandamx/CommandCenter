-- 0012_threat_intelligence_deletion_requests.sql
-- GDPR Article 17 deletion request workflow. Dedicated table rather than
-- overloading network_data_sharing_logs with request-tracking rows (see
-- deletionRequests.ts's doc comment for why) -- keeps that table purely
-- append-only audit history.

BEGIN;

CREATE TABLE IF NOT EXISTS threat_intel_deletion_requests (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    reason                   TEXT,
    delete_all               BOOLEAN NOT NULL DEFAULT true,
    data_types               JSONB NOT NULL DEFAULT '[]',
    status                   TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'rejected')) DEFAULT 'pending',
    estimated_records        INTEGER NOT NULL DEFAULT 0,
    actual_records_deleted   INTEGER,
    requested_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at             TIMESTAMPTZ,
    processed_by_staff_id    UUID REFERENCES staff_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_org ON threat_intel_deletion_requests(organization_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON threat_intel_deletion_requests(status);

COMMIT;
