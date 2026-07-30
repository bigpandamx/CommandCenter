-- 0058_campaigns.sql
-- Campaigns: verified against MITRE's own "Introducing Campaigns to
-- MITRE ATT&CK" announcement before building anything, not assumed --
-- MITRE added a real "campaign" STIX object type starting with
-- ATT&CK v12 (October 2022), living in the exact same STIX bundle
-- this module already fetches for Threat Actors
-- (mitreAttackAdapter.ts). This is the same discipline that caught
-- CISA KEV riding along on NVD's own CVE records for free -- checking
-- what an existing, already-integrated source actually contains
-- before assuming a new entity needs its own new source.
--
-- MITRE's own definition: "a grouping of intrusion activity conducted
-- over a specific period of time with common targets and objectives
-- ... that may or may not be linked to a specific threat actor."
-- That's a genuinely different concept from ThreatActor (a named
-- group) and from ThreatPattern (a technical detection signature) --
-- a Campaign is a time-bounded operation, sometimes attributed to one
-- or more actors, sometimes not.
--
-- mitre_campaign_id follows the same nullable-external-id pattern as
-- threat_actors.mitre_group_id -- staff-curated campaigns (a locally
-- observed operation not yet in MITRE's catalog) have no MITRE id at
-- all. first_seen/last_seen are stored as full timestamps but MITRE's
-- own documentation is explicit that only month/year granularity is
-- meaningful for their own Campaign objects -- the day/time portion
-- should be ignored when displaying ATT&CK-sourced campaign data,
-- noted in types.ts's own doc comment, not just here.
--
-- attributed_actor_ids is a plain TEXT[] cross-reference, not a join
-- table -- the same choice every other loose, read-mostly
-- cross-reference in this module already made (ThreatPattern.
-- relatedPatternIds, ThreatActor.relatedPatternIds, IntelligenceReport's
-- three related-id fields). Resolved from MITRE's own "attributed-to"
-- STIX relationship at ingestion time, not maintained as a live
-- foreign key.

BEGIN;

CREATE TABLE IF NOT EXISTS campaigns (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mitre_campaign_id     TEXT UNIQUE,
    name                  TEXT NOT NULL,
    aliases               TEXT[],
    description           TEXT NOT NULL,
    source                TEXT NOT NULL CHECK (source IN ('mitre_attack', 'staff_curated')),
    first_seen            TIMESTAMPTZ,
    last_seen             TIMESTAMPTZ,
    attributed_actor_ids  TEXT[],
    is_active             BOOLEAN NOT NULL DEFAULT true,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_source ON campaigns(source);
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(is_active);

COMMIT;
