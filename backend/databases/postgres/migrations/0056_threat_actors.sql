-- 0056_threat_actors.sql
-- Threat Actors: verified against MITRE's own attack-stix-data
-- repository and USAGE.md before building anything, the same
-- discipline as Vulnerabilities' NVD integration. MITRE publishes a
-- free, authoritative "Groups" dataset (130+ named threat groups) as
-- part of the ATT&CK STIX 2.1 bundle -- each group is an
-- "intrusion-set" object with name, aliases, a description, and a
-- MITRE Group ID (e.g. "G0016") in its external_references.
--
-- Deliberately scoped to actor-level data only this round -- name,
-- aliases, description, MITRE ID. The full technique-relationship
-- graph (which ATT&CK techniques a group uses) belongs to a separate,
-- later MITRE ATT&CK Explorer module, not bolted on here ahead of
-- that module actually being designed.
--
-- Unlike NVD's incremental lastModStartDate/lastModEndDate sync,
-- MITRE releases whole-bundle updates periodically, not continuously
-- -- there's no per-object "changed since X" filter available. Sync
-- is a full-bundle refresh: fetch the current Enterprise ATT&CK
-- bundle, filter to non-deprecated/non-revoked intrusion-set objects,
-- upsert each by mitre_group_id.
--
-- source distinguishes MITRE-synced actors from staff-curated ones --
-- an actor observed locally or from a vendor report that isn't (yet)
-- in MITRE's own catalog is still a real actor worth tracking, the
-- same "don't force everything through one pipeline" reasoning
-- CustomerPolicy and AuditEvidence already established for their own
-- target_type fields.

BEGIN;

CREATE TABLE IF NOT EXISTS threat_actors (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mitre_group_id    TEXT UNIQUE,
    name              TEXT NOT NULL,
    aliases           TEXT[],
    description       TEXT NOT NULL,
    source            TEXT NOT NULL CHECK (source IN ('mitre_attack', 'staff_curated')),
    is_active         BOOLEAN NOT NULL DEFAULT true,
    related_pattern_ids TEXT[],
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_threat_actors_source ON threat_actors(source);
CREATE INDEX IF NOT EXISTS idx_threat_actors_active ON threat_actors(is_active);

COMMIT;
