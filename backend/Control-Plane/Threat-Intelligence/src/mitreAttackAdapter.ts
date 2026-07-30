import type { Campaign, Malware, Technique, ThreatActor } from "./types.js";

/**
 * Adapter for MITRE ATT&CK's own attack-stix-data repository
 * (github.com/mitre-attack/attack-stix-data). Free, no API key, no
 * rate limit -- it's a static JSON file served from GitHub, not a
 * live query API. Verified directly against MITRE's own USAGE.md
 * before writing this file (github.com/mitre-attack/attack-stix-data/
 * blob/master/USAGE.md), not assumed by analogy.
 *
 * mapStixBundle() (Threat Actors) and mapStixBundleForCampaigns()
 * (Campaigns) are the tested pure parts (see
 * test/mitreAttackAdapter.test.ts, exercised against hand-written
 * sample bundles matching MITRE's own documented STIX shape).
 * fetchMitreThreatActors()/fetchMitreCampaigns() are the untested
 * network edge.
 *
 * A STIX bundle mixes many object types together in one flat
 * `objects` array (attack-pattern, intrusion-set, campaign, malware,
 * tool, course-of-action, relationship, and more) -- this adapter
 * filters to `type === "intrusion-set"` (MITRE's own term for a named
 * threat group) for actors, and `type === "campaign"` for campaigns,
 * ignoring everything else. Both deliberately exclude revoked and
 * deprecated objects (x_mitre_deprecated/revoked), matching MITRE's
 * own documented recommendation to filter these out since they're no
 * longer maintained.
 *
 * Campaign attribution is resolved from the same bundle's own
 * "relationship" objects -- MITRE connects a Campaign to a Group via
 * a relationship_type: "attributed-to" object (source_ref the
 * campaign's own STIX id, target_ref the intrusion-set's STIX id),
 * not a field on the Campaign object itself. mapStixBundleForCampaigns
 * builds a lookup from intrusion-set STIX id to that group's own
 * mitreGroupId (G00xx), then walks the attributed-to relationships to
 * resolve each campaign's attributedActorIds -- verified against
 * MITRE's own "Introducing Campaigns" announcement before writing
 * this, not guessed at.
 */

interface StixExternalReference {
  source_name: string;
  external_id?: string;
  url?: string;
  description?: string;
}

interface StixIntrusionSet {
  type: "intrusion-set";
  id: string;
  name: string;
  aliases?: string[];
  description?: string;
  external_references?: StixExternalReference[];
  x_mitre_deprecated?: boolean;
  revoked?: boolean;
}

interface StixCampaign {
  type: "campaign";
  id: string;
  name: string;
  aliases?: string[];
  description?: string;
  first_seen?: string;
  last_seen?: string;
  external_references?: StixExternalReference[];
  x_mitre_deprecated?: boolean;
  revoked?: boolean;
}

interface StixKillChainPhase {
  kill_chain_name: string;
  phase_name: string;
}

interface StixAttackPattern {
  type: "attack-pattern";
  id: string;
  name: string;
  description?: string;
  kill_chain_phases?: StixKillChainPhase[];
  x_mitre_is_subtechnique?: boolean;
  x_mitre_platforms?: string[];
  external_references?: StixExternalReference[];
  x_mitre_deprecated?: boolean;
  revoked?: boolean;
}

interface StixMalwareOrTool {
  type: "malware" | "tool";
  id: string;
  name: string;
  description?: string;
  /** Note: NOT the plain "aliases" field intrusion-set/campaign use -- verified directly against a real MITRE malware object's own fields before writing this. */
  x_mitre_aliases?: string[];
  x_mitre_platforms?: string[];
  external_references?: StixExternalReference[];
  x_mitre_deprecated?: boolean;
  revoked?: boolean;
}

interface StixRelationship {
  type: "relationship";
  relationship_type: string;
  source_ref: string;
  target_ref: string;
}

interface StixBundle {
  type: "bundle";
  id: string;
  objects: unknown[];
}

function isNonRevokedIntrusionSet(obj: unknown): obj is StixIntrusionSet {
  if (typeof obj !== "object" || obj === null) return false;
  const record = obj as Record<string, unknown>;
  return record.type === "intrusion-set" && record.x_mitre_deprecated !== true && record.revoked !== true;
}

/** MITRE uses the same "mitre-attack" source_name convention for both a Group's G00xx id and a Campaign's C00xx id -- one helper covers both. */
function extractMitreExternalId(refs: StixExternalReference[] | undefined): string | null {
  const ref = refs?.find((r) => r.source_name === "mitre-attack");
  return ref?.external_id ?? null;
}

export function mapStixBundle(bundle: StixBundle, now: Date = new Date()): ThreatActor[] {
  const intrusionSets = bundle.objects.filter(isNonRevokedIntrusionSet);

  return intrusionSets.map((group) => ({
    id: "", // assigned by ingestThreatActors on first insert; the upsert key is mitreGroupId, not id
    mitreGroupId: extractMitreExternalId(group.external_references),
    name: group.name,
    aliases: group.aliases && group.aliases.length > 0 ? group.aliases : null,
    description: group.description ?? "",
    source: "mitre_attack",
    isActive: true,
    relatedPatternIds: null,
    // MITRE's own sync has no opinion on geography -- see
    // 0069_threat_geography.sql. Staff tag these after the fact;
    // ingestThreatActors preserves whatever staff already set on
    // re-sync, same as isActive.
    originCountry: null,
    targetedCountries: null,
    createdAt: now,
    updatedAt: now,
  }));
}

function isNonRevokedCampaign(obj: unknown): obj is StixCampaign {
  if (typeof obj !== "object" || obj === null) return false;
  const record = obj as Record<string, unknown>;
  return record.type === "campaign" && record.x_mitre_deprecated !== true && record.revoked !== true;
}

function isAttributionRelationship(obj: unknown): obj is StixRelationship {
  if (typeof obj !== "object" || obj === null) return false;
  const record = obj as Record<string, unknown>;
  return record.type === "relationship" && record.relationship_type === "attributed-to";
}

/**
 * MITRE's own documented granularity: first_seen/last_seen are
 * meaningful only to month/year for ATT&CK Campaign objects -- the
 * day/time portion should be ignored by parsers displaying this data.
 * Stored as full Date objects regardless (simpler than a separate
 * month/year type), with that caveat carried in Campaign's own doc
 * comment for anything that renders these fields.
 */
export function mapStixBundleForCampaigns(bundle: StixBundle, now: Date = new Date()): Campaign[] {
  const campaigns = bundle.objects.filter(isNonRevokedCampaign);
  const intrusionSets = bundle.objects.filter(isNonRevokedIntrusionSet);
  const attributions = bundle.objects.filter(isAttributionRelationship);

  // STIX id -> that group's own mitreGroupId (G00xx), so an
  // attributed-to relationship (which only carries STIX ids) can be
  // resolved to the identifier ThreatActor.mitreGroupId actually uses.
  const groupStixIdToMitreGroupId = new Map<string, string>();
  for (const group of intrusionSets) {
    const mitreGroupId = extractMitreExternalId(group.external_references);
    if (mitreGroupId) groupStixIdToMitreGroupId.set(group.id, mitreGroupId);
  }

  return campaigns.map((campaign) => {
    const attributedGroupStixIds = attributions.filter((rel) => rel.source_ref === campaign.id).map((rel) => rel.target_ref);
    const attributedActorIds = attributedGroupStixIds
      .map((stixId) => groupStixIdToMitreGroupId.get(stixId))
      .filter((id): id is string => id !== undefined);

    return {
      id: "", // assigned by ingestCampaigns on first insert; the upsert key is mitreCampaignId, not id
      mitreCampaignId: extractMitreExternalId(campaign.external_references),
      name: campaign.name,
      aliases: campaign.aliases && campaign.aliases.length > 0 ? campaign.aliases : null,
      description: campaign.description ?? "",
      source: "mitre_attack" as const,
      firstSeen: campaign.first_seen ? new Date(campaign.first_seen) : null,
      lastSeen: campaign.last_seen ? new Date(campaign.last_seen) : null,
      attributedActorIds: attributedActorIds.length > 0 ? attributedActorIds : null,
      isActive: true,
      // MITRE's own sync has no opinion on geography -- see
      // 0069_threat_geography.sql. Staff tag these after the fact;
      // ingestCampaigns preserves whatever staff already set on
      // re-sync, same as isActive.
      originCountry: null,
      targetedCountries: null,
      createdAt: now,
      updatedAt: now,
    };
  });
}

function isNonRevokedAttackPattern(obj: unknown): obj is StixAttackPattern {
  if (typeof obj !== "object" || obj === null) return false;
  const record = obj as Record<string, unknown>;
  return record.type === "attack-pattern" && record.x_mitre_deprecated !== true && record.revoked !== true;
}

function isUsesRelationship(obj: unknown): obj is StixRelationship {
  if (typeof obj !== "object" || obj === null) return false;
  const record = obj as Record<string, unknown>;
  return record.type === "relationship" && record.relationship_type === "uses";
}

function isSubtechniqueOfRelationship(obj: unknown): obj is StixRelationship {
  if (typeof obj !== "object" || obj === null) return false;
  const record = obj as Record<string, unknown>;
  return record.type === "relationship" && record.relationship_type === "subtechnique-of";
}

function extractTactics(phases: StixKillChainPhase[] | undefined): string[] | null {
  if (!phases || phases.length === 0) return null;
  const tactics = phases.filter((p) => p.kill_chain_name === "mitre-attack").map((p) => p.phase_name);
  return tactics.length > 0 ? tactics : null;
}

/**
 * Verified against MITRE's own USAGE.md before writing this, not
 * guessed at -- see this file's own top comment and Technique's doc
 * comment for the full reasoning. Sub-technique parentage comes from
 * a "subtechnique-of" relationship (source the sub-technique, target
 * the parent), not a naming convention; usage attribution comes from
 * "uses" relationships from either an intrusion-set or a campaign,
 * direct only, mirroring mapStixBundleForCampaigns' own
 * attributed-to resolution shape.
 */
export function mapStixBundleForTechniques(bundle: StixBundle, now: Date = new Date()): Technique[] {
  const attackPatterns = bundle.objects.filter(isNonRevokedAttackPattern);
  const intrusionSets = bundle.objects.filter(isNonRevokedIntrusionSet);
  const campaigns = bundle.objects.filter(isNonRevokedCampaign);
  const usesRelationships = bundle.objects.filter(isUsesRelationship);
  const subtechniqueOfRelationships = bundle.objects.filter(isSubtechniqueOfRelationship);

  const groupStixIdToMitreGroupId = new Map<string, string>();
  for (const group of intrusionSets) {
    const mitreGroupId = extractMitreExternalId(group.external_references);
    if (mitreGroupId) groupStixIdToMitreGroupId.set(group.id, mitreGroupId);
  }

  const campaignStixIdToMitreCampaignId = new Map<string, string>();
  for (const campaign of campaigns) {
    const mitreCampaignId = extractMitreExternalId(campaign.external_references);
    if (mitreCampaignId) campaignStixIdToMitreCampaignId.set(campaign.id, mitreCampaignId);
  }

  const attackPatternStixIdToMitreTechniqueId = new Map<string, string>();
  for (const technique of attackPatterns) {
    const mitreTechniqueId = extractMitreExternalId(technique.external_references);
    if (mitreTechniqueId) attackPatternStixIdToMitreTechniqueId.set(technique.id, mitreTechniqueId);
  }

  return attackPatterns.map((technique) => {
    const usedByGroupStixIds = usesRelationships
      .filter((rel) => rel.target_ref === technique.id && groupStixIdToMitreGroupId.has(rel.source_ref))
      .map((rel) => groupStixIdToMitreGroupId.get(rel.source_ref) as string);
    const usedByCampaignStixIds = usesRelationships
      .filter((rel) => rel.target_ref === technique.id && campaignStixIdToMitreCampaignId.has(rel.source_ref))
      .map((rel) => campaignStixIdToMitreCampaignId.get(rel.source_ref) as string);

    const parentRelationship = subtechniqueOfRelationships.find((rel) => rel.source_ref === technique.id);
    const parentMitreTechniqueId = parentRelationship ? (attackPatternStixIdToMitreTechniqueId.get(parentRelationship.target_ref) ?? null) : null;

    return {
      id: "", // assigned by ingestTechniques on first insert; the upsert key is mitreTechniqueId, not id
      mitreTechniqueId: extractMitreExternalId(technique.external_references),
      name: technique.name,
      description: technique.description ?? "",
      tactics: extractTactics(technique.kill_chain_phases),
      isSubtechnique: technique.x_mitre_is_subtechnique === true,
      parentMitreTechniqueId,
      platforms: technique.x_mitre_platforms && technique.x_mitre_platforms.length > 0 ? technique.x_mitre_platforms : null,
      usedByActorMitreGroupIds: usedByGroupStixIds.length > 0 ? usedByGroupStixIds : null,
      usedByCampaignMitreCampaignIds: usedByCampaignStixIds.length > 0 ? usedByCampaignStixIds : null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
  });
}

function isNonRevokedMalwareOrTool(obj: unknown): obj is StixMalwareOrTool {
  if (typeof obj !== "object" || obj === null) return false;
  const record = obj as Record<string, unknown>;
  return (record.type === "malware" || record.type === "tool") && record.x_mitre_deprecated !== true && record.revoked !== true;
}

/**
 * MITRE's own "Software" category -- verified against real STIX
 * examples before writing this, not guessed at. Three independent
 * "uses" resolutions, more than any other mapper in this file: who
 * uses this malware (Groups, Campaigns) and what this malware itself
 * uses (Techniques) -- see Malware's own doc comment and
 * 0067_malware.sql for the full reasoning.
 */
export function mapStixBundleForMalware(bundle: StixBundle, now: Date = new Date()): Malware[] {
  const malwareAndTools = bundle.objects.filter(isNonRevokedMalwareOrTool);
  const intrusionSets = bundle.objects.filter(isNonRevokedIntrusionSet);
  const campaigns = bundle.objects.filter(isNonRevokedCampaign);
  const attackPatterns = bundle.objects.filter(isNonRevokedAttackPattern);
  const usesRelationships = bundle.objects.filter(isUsesRelationship);

  const groupStixIdToMitreGroupId = new Map<string, string>();
  for (const group of intrusionSets) {
    const mitreGroupId = extractMitreExternalId(group.external_references);
    if (mitreGroupId) groupStixIdToMitreGroupId.set(group.id, mitreGroupId);
  }

  const campaignStixIdToMitreCampaignId = new Map<string, string>();
  for (const campaign of campaigns) {
    const mitreCampaignId = extractMitreExternalId(campaign.external_references);
    if (mitreCampaignId) campaignStixIdToMitreCampaignId.set(campaign.id, mitreCampaignId);
  }

  const attackPatternStixIdToMitreTechniqueId = new Map<string, string>();
  for (const technique of attackPatterns) {
    const mitreTechniqueId = extractMitreExternalId(technique.external_references);
    if (mitreTechniqueId) attackPatternStixIdToMitreTechniqueId.set(technique.id, mitreTechniqueId);
  }

  return malwareAndTools.map((software) => {
    const usedByGroupStixIds = usesRelationships
      .filter((rel) => rel.target_ref === software.id && groupStixIdToMitreGroupId.has(rel.source_ref))
      .map((rel) => groupStixIdToMitreGroupId.get(rel.source_ref) as string);
    const usedByCampaignStixIds = usesRelationships
      .filter((rel) => rel.target_ref === software.id && campaignStixIdToMitreCampaignId.has(rel.source_ref))
      .map((rel) => campaignStixIdToMitreCampaignId.get(rel.source_ref) as string);
    const usesTechniqueStixIds = usesRelationships
      .filter((rel) => rel.source_ref === software.id && attackPatternStixIdToMitreTechniqueId.has(rel.target_ref))
      .map((rel) => attackPatternStixIdToMitreTechniqueId.get(rel.target_ref) as string);

    return {
      id: "", // assigned by ingestMalware on first insert; the upsert key is mitreSoftwareId, not id
      mitreSoftwareId: extractMitreExternalId(software.external_references),
      name: software.name,
      aliases: software.x_mitre_aliases && software.x_mitre_aliases.length > 0 ? software.x_mitre_aliases : null,
      description: software.description ?? "",
      softwareType: software.type,
      source: "mitre_attack" as const,
      platforms: software.x_mitre_platforms && software.x_mitre_platforms.length > 0 ? software.x_mitre_platforms : null,
      usedByActorMitreGroupIds: usedByGroupStixIds.length > 0 ? usedByGroupStixIds : null,
      usedByCampaignMitreCampaignIds: usedByCampaignStixIds.length > 0 ? usedByCampaignStixIds : null,
      usesMitreTechniqueIds: usesTechniqueStixIds.length > 0 ? usesTechniqueStixIds : null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
  });
}

const ENTERPRISE_ATTACK_URL = "https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json";

/**
 * Untested against live network. Fetches the full current Enterprise
 * ATT&CK STIX bundle -- there's no incremental/date-filtered endpoint
 * the way NVD has; MITRE publishes whole-dataset releases, so a
 * refresh means re-fetching and re-filtering the entire bundle, then
 * letting ingestThreatActors' own upsert-by-mitreGroupId sort out
 * what's actually new or changed.
 */
export async function fetchMitreThreatActors(): Promise<ThreatActor[]> {
  const response = await fetch(ENTERPRISE_ATTACK_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`MITRE ATT&CK fetch failed: HTTP ${response.status}`);
  }
  const bundle = (await response.json()) as StixBundle;
  return mapStixBundle(bundle);
}

/** Untested against live network. Same whole-bundle-refresh shape as fetchMitreThreatActors -- see that function's own doc comment. */
export async function fetchMitreCampaigns(): Promise<Campaign[]> {
  const response = await fetch(ENTERPRISE_ATTACK_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`MITRE ATT&CK fetch failed: HTTP ${response.status}`);
  }
  const bundle = (await response.json()) as StixBundle;
  return mapStixBundleForCampaigns(bundle);
}

/** Untested against live network. Same whole-bundle-refresh shape as fetchMitreThreatActors -- see that function's own doc comment. */
export async function fetchMitreTechniques(): Promise<Technique[]> {
  const response = await fetch(ENTERPRISE_ATTACK_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`MITRE ATT&CK fetch failed: HTTP ${response.status}`);
  }
  const bundle = (await response.json()) as StixBundle;
  return mapStixBundleForTechniques(bundle);
}

/** Untested against live network. Same whole-bundle-refresh shape as fetchMitreThreatActors -- see that function's own doc comment. */
export async function fetchMitreMalware(): Promise<Malware[]> {
  const response = await fetch(ENTERPRISE_ATTACK_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`MITRE ATT&CK fetch failed: HTTP ${response.status}`);
  }
  const bundle = (await response.json()) as StixBundle;
  return mapStixBundleForMalware(bundle);
}
