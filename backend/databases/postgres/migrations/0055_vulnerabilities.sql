-- 0055_vulnerabilities.sql
-- Vulnerabilities (CVE): the first module of the broader Threat
-- Intelligence platform vision, and the first with a real, verified
-- external authoritative source (NVD's CVE API 2.0, confirmed
-- directly against NVD's own published developer documentation, not
-- assumed). See types.ts's own doc comment on Vulnerability for the
-- full reasoning, including why this is a rolling window rather than
-- an archive of NVD's 370,000+ CVE records, and why ingestion upserts
-- (a CVE's severity, KEV status, and even rejection status genuinely
-- change over time at the source) rather than skip-if-seen the way
-- Compliance's own immutable updates do.
--
-- cve_id is the natural, globally-unique key NVD itself assigns --
-- upserted against directly, not wrapped in a separate internal id
-- lookup the way Compliance's per-source externalId needs to be
-- (NVD has exactly one namespace; Compliance has many sources that
-- could each use the string "2024-001" for something unrelated).
--
-- affected_products, weaknesses, and reference_urls are stored as
-- TEXT[], not normalized into their own tables -- deliberately,
-- matching ThreatPattern's own indicatorsOfCompromise field: these
-- are read-mostly, queried as a whole per-CVE, not joined against or
-- searched independently. A real Indicators of Compromise module
-- (separate, deliberately deferred) would be the place a dedicated,
-- deduplicated, cross-CVE IOC table belongs.
--
-- reference_urls, not "references" -- REFERENCES is a reserved SQL
-- keyword (used in foreign key constraints); using it as a column
-- name would require quoting it everywhere for no real benefit.

BEGIN;

CREATE TABLE IF NOT EXISTS vulnerabilities (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cve_id                  TEXT NOT NULL UNIQUE,
    vuln_status             TEXT NOT NULL,
    description             TEXT NOT NULL,
    cvss_version            TEXT,
    cvss_base_score         NUMERIC(3,1),
    cvss_base_severity      TEXT CHECK (cvss_base_severity IN ('critical', 'high', 'medium', 'low', 'none')),
    cvss_vector_string      TEXT,
    weaknesses              TEXT[],
    affected_products       TEXT[],
    reference_urls          TEXT[],
    is_known_exploited      BOOLEAN NOT NULL DEFAULT false,
    kev_added_at            TIMESTAMPTZ,
    kev_due_date            TIMESTAMPTZ,
    kev_required_action     TEXT,
    kev_vulnerability_name  TEXT,
    published_at            TIMESTAMPTZ NOT NULL,
    last_modified_at        TIMESTAMPTZ NOT NULL,
    ingested_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_severity ON vulnerabilities(cvss_base_severity);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_kev ON vulnerabilities(is_known_exploited) WHERE is_known_exploited = true;
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_last_modified ON vulnerabilities(last_modified_at);

COMMIT;
