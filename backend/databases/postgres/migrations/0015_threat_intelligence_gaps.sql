-- 0015_threat_intelligence_gaps.sql
-- Closes gaps found in a systematic audit against Aegis's original
-- network_intelligence_service.py: signature detection tracking (the
-- missing counterpart to threat_pattern_observations for
-- PromptAbuseSignature) and soft-delete support for the retention
-- cleanup job. See CUTOVER.md and src/signatureDetections.ts /
-- src/retentionCleanup.ts for the full reasoning.

BEGIN;

CREATE TABLE IF NOT EXISTS signature_detections (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signature_id        UUID NOT NULL REFERENCES prompt_abuse_signatures(id) ON DELETE CASCADE,
    -- Nullable: a detection can be reported without org context (see
    -- signatureDetections.ts -- unlike observations, this isn't
    -- consent-gated, since it's reporting a signature match, not
    -- sharing an org's own risk data).
    organization_hash   TEXT,
    detected_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_signature_detections_signature ON signature_detections(signature_id);
CREATE INDEX IF NOT EXISTS idx_signature_detections_signature_org ON signature_detections(signature_id, organization_hash);

ALTER TABLE network_data_sharing_logs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMIT;
