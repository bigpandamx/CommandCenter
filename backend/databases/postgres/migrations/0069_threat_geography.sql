-- 0069_threat_geography.sql
-- Geographic Intelligence, part 1: staff-curated geographic
-- attribution on Threat Actors and Campaigns.
--
-- Investigated before building anything: MITRE's own official STIX
-- data (attack-stix-data) has NO structured country-of-origin or
-- targeted-country fields on intrusion-set or campaign objects --
-- that information exists only as unstructured prose inside the
-- description field (e.g. "APT29 is a threat group that has been
-- attributed to Russia's Foreign Intelligence Service (SVR) ...
-- often targeting government networks in Europe and NATO member
-- countries"). A third-party academic project has parsed these
-- descriptions into structured STIX location objects, but it's a
-- derivative research artifact, not MITRE's own authoritative data --
-- using it would be a real departure from how every other module in
-- this set has stuck to primary, official sources (NVD directly,
-- MITRE's own attack-stix-data directly). Automated text-parsing to
-- extract country names from free-form prose was also ruled out --
-- heuristic, error-prone, and would present inference as fact.
--
-- origin_country and targeted_countries are therefore staff-curated,
-- not synced from MITRE -- an analyst reads the same description
-- text a human would, confirms what it actually says, and tags it.
-- Same "staff judgment call, not auto-derived" principle already
-- established for isActive on every MITRE-sourced entity in this
-- module. Ingestion (ingestThreatActors/ingestCampaigns) must
-- preserve these fields across re-sync exactly like isActive already
-- is -- MITRE's own sync has no opinion on geography at all.
--
-- Plain TEXT columns, matching organization_profiles.country's own
-- existing shape -- free text, not a closed enum or ISO code list.
-- The cross-reference this enables (Geographic Intelligence's own
-- dashboard) matches case-insensitively against that same free-text
-- field; this is a real, honest text match against real customer
-- data, not a validated geographic hierarchy -- it won't know
-- "California" is in "the United States" unless both sides use the
-- same string, and the UI says so.

BEGIN;

ALTER TABLE threat_actors ADD COLUMN IF NOT EXISTS origin_country TEXT;
ALTER TABLE threat_actors ADD COLUMN IF NOT EXISTS targeted_countries TEXT[];

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS origin_country TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS targeted_countries TEXT[];

CREATE INDEX IF NOT EXISTS idx_threat_actors_origin_country ON threat_actors(origin_country);
CREATE INDEX IF NOT EXISTS idx_campaigns_origin_country ON campaigns(origin_country);

COMMIT;
