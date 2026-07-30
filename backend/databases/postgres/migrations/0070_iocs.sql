-- 0070_iocs.sql
-- IOC Management: structured indicators of compromise (IPs, domains,
-- URLs, email addresses, file hashes), replacing what was previously
-- only ThreatPattern.indicatorsOfCompromise's free-text string array.
--
-- Investigated a real external source before building anything:
-- ThreatFox (abuse.ch), a genuine, purpose-built IOC-sharing platform
-- covering exactly this scope ("an IOC is an IP address, domain name,
-- URL, email address or file hash"). Unlike every other external
-- source integrated in this module (NVD, MITRE ATT&CK), ThreatFox
-- requires a registered Auth-Key -- a real infrastructure decision,
-- not something to build around silently. Confirmed with the user:
-- staff-curated only for this first pass, ThreatFox integration
-- deferred to a later round, not built quietly around a missing key.
--
-- source is nonetheless modeled now with a closed set including
-- "threatfox" alongside "staff_curated", even though only the latter
-- is reachable today -- the same "design for the known future, don't
-- over-build" precedent MalwareSource/CampaignSource already
-- established, so a later ThreatFox sync doesn't need a schema
-- migration of its own.
--
-- ioc_type is a closed enum matching the real, common IOC taxonomy
-- (ThreatFox's own scope, and the industry standard more broadly),
-- not free text -- these categories are well-established and don't
-- grow the way something like a jurisdiction list does.
--
-- threat_type is deliberately free text, not a closed enum -- unlike
-- ioc_type, the ways to describe what an indicator is FOR (botnet
-- C2, payload delivery, phishing infrastructure, and so on) aren't a
-- small fixed set, and guessing at ThreatFox's own exact enum values
-- from search snippets alone rather than their full API reference
-- would risk getting it wrong.
--
-- UNIQUE on (ioc_type, value), not value alone -- deduplication
-- should be per-type; a value collision across types is not
-- meaningfully the same indicator.
--
-- related_pattern_ids / related_actor_ids / related_campaign_ids /
-- related_malware_ids are the same loose TEXT[] cross-reference
-- pattern every other entity in this module already uses for a
-- comparable loose association -- not a join table.

BEGIN;

CREATE TABLE IF NOT EXISTS iocs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ioc_type                TEXT NOT NULL CHECK (ioc_type IN ('ip', 'domain', 'url', 'email', 'file_hash_md5', 'file_hash_sha1', 'file_hash_sha256')),
    value                   TEXT NOT NULL,
    threat_type             TEXT,
    description             TEXT,
    source                  TEXT NOT NULL DEFAULT 'staff_curated' CHECK (source IN ('staff_curated', 'threatfox')),
    related_pattern_ids     TEXT[],
    related_actor_ids       TEXT[],
    related_campaign_ids    TEXT[],
    related_malware_ids     TEXT[],
    is_active               BOOLEAN NOT NULL DEFAULT true,
    first_seen_at           TIMESTAMPTZ,
    last_seen_at            TIMESTAMPTZ,
    created_by_staff_id     UUID NOT NULL REFERENCES staff_users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ioc_type, value)
);
CREATE INDEX IF NOT EXISTS idx_iocs_ioc_type ON iocs(ioc_type);
CREATE INDEX IF NOT EXISTS idx_iocs_active ON iocs(is_active);

COMMIT;
