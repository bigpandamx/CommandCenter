-- 0059_techniques.sql
-- MITRE ATT&CK Techniques: verified against MITRE's own USAGE.md
-- (github.com/mitre-attack/attack-stix-data/blob/master/USAGE.md)
-- before building anything, not assumed by analogy. Techniques and
-- sub-techniques are both represented as `attack-pattern` STIX
-- objects in the exact same bundle already fetched for Threat Actors
-- and Campaigns -- this was the deliberately-deferred piece when
-- Threat Actors was first built ("only Groups exist today, not the
-- technique-relationship graph").
--
-- is_subtechnique / parent_mitre_technique_id follow MITRE's own
-- model directly: a technique like T1566 (Phishing) has
-- sub-techniques like T1566.001 (Spearphishing Attachment), each its
-- own attack-pattern object connected to its parent via a
-- "subtechnique-of" relationship, not a naming convention alone.
--
-- tactics is a plain TEXT[] of tactic shortnames (e.g.
-- "initial-access"), not a foreign key to a separate Tactic table --
-- ATT&CK's own Enterprise tactic list is a small, fixed taxonomy (14
-- tactics) that changes rarely enough that a lookup table would add
-- real complexity (migrations, ingestion, a UI to manage it) for a
-- taxonomy MITRE already publishes and rarely revises. Resolved from
-- a technique's own kill_chain_phases (phase_name matches a tactic's
-- x_mitre_shortname; kill_chain_name "mitre-attack" for Enterprise).
--
-- used_by_actor_mitre_group_ids / used_by_campaign_mitre_campaign_ids
-- are the same loose TEXT[] cross-reference pattern as Campaign's own
-- attributed_actor_ids -- resolved from MITRE's own "uses"
-- relationships at ingestion time, direct usage only (not the
-- transitive "campaign attributed to a group" combination MITRE's
-- own USAGE.md documents as a separate, more involved computation --
-- deliberately not attempted here, matching the same "real, bounded
-- scope, not the full combinatorial picture" discipline
-- Campaign.attributedActorIds already established).

BEGIN;

CREATE TABLE IF NOT EXISTS techniques (
    id                                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mitre_technique_id                    TEXT UNIQUE,
    name                                  TEXT NOT NULL,
    description                           TEXT NOT NULL,
    tactics                               TEXT[],
    is_subtechnique                       BOOLEAN NOT NULL DEFAULT false,
    parent_mitre_technique_id             TEXT,
    platforms                             TEXT[],
    used_by_actor_mitre_group_ids         TEXT[],
    used_by_campaign_mitre_campaign_ids   TEXT[],
    is_active                             BOOLEAN NOT NULL DEFAULT true,
    created_at                            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_techniques_is_subtechnique ON techniques(is_subtechnique);
CREATE INDEX IF NOT EXISTS idx_techniques_active ON techniques(is_active);
CREATE INDEX IF NOT EXISTS idx_techniques_parent ON techniques(parent_mitre_technique_id);

COMMIT;
