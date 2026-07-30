/**
 * Threat pattern and prompt-abuse-signature library: platform-wide,
 * cross-org threat intelligence for Aegis's enforcement agents/backend
 * to sync and enforce locally. This is Phase 1 (library + distribution)
 * of the module described in CUTOVER.md -- observation reporting,
 * differential-privacy aggregation, consent management, and benchmarks
 * are later phases, not built here.
 *
 * Field names and enum values here deliberately mirror Aegis's existing
 * `models/network_intelligence.py` (ThreatPattern, PromptAbuseSignature)
 * and the RiskSignalType/ThreatSeverity enums from that same file --
 * this is a genuine migration of an existing, well-designed system's
 * cross-org concern into Command Center, not a fresh invention, so it
 * should speak the same vocabulary Aegis already uses rather than
 * introducing a translation layer for no reason.
 *
 * Real-time, per-request detection (Aegis's PromptInjectionPattern /
 * PromptInjectionDetectionEvent in llm_threat.py) stays in Aegis --
 * that's latency-sensitive, in the hot path of every prompt, and
 * correctly scoped per-org. What moves here is the shared reference
 * library those local detectors sync against, matching the same
 * "platform-wide reference data vs. per-org operational data" split
 * Aegis's own code comments already describe for LLMThreatCategory.
 */

export type ThreatSeverity = "critical" | "high" | "medium" | "low" | "info";

export type ThreatType =
  | "deployment_failure"
  | "policy_violation"
  | "audit_anomaly"
  | "prompt_injection"
  | "data_leakage"
  | "bias_detection"
  | "performance_degradation"
  | "compliance_gap"
  | "security_incident";

export interface ThreatPattern {
  id: string;
  /** Human-readable identifier, e.g. "THREAT-2026-001" -- unique, used in references/UI, distinct from the internal UUID id. */
  patternId: string;
  patternName: string;
  threatType: ThreatType;
  severity: ThreatSeverity;
  description: string;
  attackVector: string;
  /** Indicators of compromise -- free-text list, e.g. suspicious header values, known-bad model outputs. */
  indicatorsOfCompromise: string[] | null;
  /** Opaque to Command Center -- interpreted by Aegis's local detection engine. Could be regex, keyword lists, or a more structured rule set; this module doesn't need to understand it, only store and distribute it. */
  detectionSignature: Record<string, unknown>;
  confidenceThreshold: number;
  firstObserved: Date;
  lastObserved: Date;
  totalObservations: number;
  affectedOrganizationsCount: number;
  affectedIndustries: string[] | null;
  avgSeverityScore: number;
  successRate: number | null;
  estimatedPrevalence: string | null;
  mitigationSteps: string[] | null;
  remediationGuidance: string | null;
  isActive: boolean;
  isFalsePositive: boolean;
  verifiedByAnalyst: boolean;
  /** CVE IDs, MITRE ATT&CK/ATLAS technique IDs, etc. */
  externalReferences: string[] | null;
  relatedPatternIds: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromptAbuseSignature {
  id: string;
  signatureId: string;
  signatureName: string;
  /** e.g. "injection", "jailbreak", "extraction" -- free text matching Aegis's existing category field, not a closed enum, since new abuse categories emerge faster than a fixed list can track. */
  category: string;
  patternRegex: string | null;
  patternKeywords: string[] | null;
  detectionLogic: Record<string, unknown>;
  matchThreshold: number;
  discoveredFromOrgCount: number;
  totalDetections: number;
  falsePositiveRate: number | null;
  severity: ThreatSeverity;
  riskScore: number;
  /** Sanitized/anonymized example prompts -- never raw customer prompt text. */
  examplePrompts: string[] | null;
  isActive: boolean;
  isExperimental: boolean;
  relatedThreatPatternId: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastDetection: Date | null;
}

export interface CreateThreatPatternInput {
  patternId: string;
  patternName: string;
  threatType: ThreatType;
  severity: ThreatSeverity;
  description: string;
  attackVector: string;
  indicatorsOfCompromise?: string[];
  detectionSignature: Record<string, unknown>;
  confidenceThreshold?: number;
  affectedIndustries?: string[];
  avgSeverityScore: number;
  successRate?: number;
  estimatedPrevalence?: string;
  mitigationSteps?: string[];
  remediationGuidance?: string;
  externalReferences?: string[];
  relatedPatternIds?: string[];
}

export interface CreatePromptAbuseSignatureInput {
  signatureId: string;
  signatureName: string;
  category: string;
  patternRegex?: string;
  patternKeywords?: string[];
  detectionLogic: Record<string, unknown>;
  matchThreshold?: number;
  severity: ThreatSeverity;
  riskScore: number;
  examplePrompts?: string[];
  isExperimental?: boolean;
  relatedThreatPatternId?: string;
}

export interface ThreatPatternSearchQuery {
  severity?: ThreatSeverity;
  threatType?: ThreatType;
  isActive?: boolean;
  /** For distribution sync -- only patterns updated at or after this time. */
  updatedSince?: Date;
  text?: string;
}

export interface SignatureSearchQuery {
  category?: string;
  severity?: ThreatSeverity;
  isActive?: boolean;
  updatedSince?: Date;
  text?: string;
}

/**
 * Vulnerabilities (CVE): ingested from NVD's own CVE API 2.0
 * (services.nvd.nist.gov/rest/json/cves/2.0), verified directly
 * against NVD's published developer documentation, not assumed by
 * analogy the way an earlier adapter in this codebase (Federal
 * Register) had to be built without live network access.
 *
 * Deliberately a real, current window, not an archive -- NVD holds
 * 370,000+ CVE records; mirroring all of them would make "28 Critical
 * CVEs" on a dashboard meaningless (28 out of how many, over what
 * period?). Ingestion syncs incrementally using NVD's own recommended
 * lastModStartDate/lastModEndDate pattern, deriving the window from
 * the most recently seen lastModifiedAt already stored rather than
 * tracking a separate "last synced" row -- the data's own high-water
 * mark IS the sync state. NVD caps any date-range query at 120
 * consecutive days; a gap longer than that (e.g. the job didn't run
 * for months) means the sync window is capped at the most recent 120
 * days, not walked forward in 120-day chunks -- a known, stated
 * limitation for an unusually long outage, not silently handled.
 *
 * Genuinely mutable, unlike Compliance's own ingested updates: a CVE's
 * severity gets revised, KEV status gets added after the fact, a
 * rejected CVE gets unrejected. Ingestion upserts by cveId (the
 * NVD-assigned, globally unique identifier) rather than skip-if-seen.
 *
 * KEV (CISA Known Exploited Vulnerabilities) status is carried
 * natively on the NVD record itself (cisaExploitAdd/cisaActionDue/
 * cisaRequiredAction/cisaVulnerabilityName) -- no separate CISA feed
 * needed to answer "is this one of the vulnerabilities actually being
 * exploited in the wild."
 */
export type CvssSeverity = "critical" | "high" | "medium" | "low" | "none";

export interface Vulnerability {
  id: string;
  /** NVD's own CVE identifier, e.g. "CVE-2024-12345" -- globally unique, what ingestion upserts against. */
  cveId: string;
  /** NVD's own vulnStatus, e.g. "Analyzed", "Modified", "Awaiting Analysis", "Rejected". */
  vulnStatus: string;
  /** English-language description; NVD's descriptions array can carry multiple languages, only "en" is kept. */
  description: string;
  /** "3.1", "3.0", or "2.0" -- whichever CVSS version NVD's metrics object actually provided (preferring the highest available), null if the CVE has no metrics yet (e.g. still Awaiting Analysis). */
  cvssVersion: string | null;
  cvssBaseScore: number | null;
  cvssBaseSeverity: CvssSeverity | null;
  cvssVectorString: string | null;
  /** CWE identifiers from NVD's weaknesses object, e.g. ["CWE-79"]. */
  weaknesses: string[] | null;
  /** Simplified from NVD's own nested configurations/CPE-match structure to a flat list of CPE match strings -- the full AND/OR/NEGATE logic tree is deliberately not modeled here; see nvdAdapter.ts for what's kept vs. dropped. */
  affectedProducts: string[] | null;
  referenceUrls: string[] | null;
  isKnownExploited: boolean;
  /** The date this CVE was added to CISA's KEV catalog, null if not KEV-listed. */
  kevAddedAt: Date | null;
  /** The BOD 22-01 remediation deadline for federal agencies -- informational for Command Center, not a claim any specific org is bound by it. */
  kevDueDate: Date | null;
  kevRequiredAction: string | null;
  kevVulnerabilityName: string | null;
  publishedAt: Date;
  lastModifiedAt: Date;
  ingestedAt: Date;
  updatedAt: Date;
}

export interface VulnerabilitySearchQuery {
  severity?: CvssSeverity;
  isKnownExploited?: boolean;
  /** For distribution sync -- only vulnerabilities modified at or after this time. Same cursor shape as ThreatPatternSearchQuery.updatedSince. */
  lastModifiedSince?: Date;
  limit?: number;
}

/**
 * Threat Actors: verified against MITRE's own attack-stix-data
 * repository and USAGE.md before building anything, the same
 * discipline as Vulnerabilities' NVD integration. See
 * 0056_threat_actors.sql for the full reasoning, including why this
 * is scoped to actor-level data only this round (name, aliases,
 * description, MITRE ID) -- the full technique-relationship graph
 * belongs to a separate, later MITRE ATT&CK Explorer module -- and
 * why sync is a whole-bundle refresh rather than an incremental one
 * (MITRE releases periodic full-dataset updates, not a per-object
 * "changed since X" feed the way NVD does).
 */
export type ThreatActorSource = "mitre_attack" | "staff_curated";

export interface ThreatActor {
  id: string;
  /** e.g. "G0016" -- MITRE's own ATT&CK Group ID, from external_references where source_name === "mitre-attack". Null for staff-curated actors with no MITRE mapping. */
  mitreGroupId: string | null;
  name: string;
  /** Threat intel groups are routinely known by multiple names across different vendors' own naming conventions -- e.g. APT29 = Cozy Bear = The Dukes = Midnight Blizzard. */
  aliases: string[] | null;
  description: string;
  source: ThreatActorSource;
  /** Staff-controlled -- MITRE's own x_mitre_deprecated/revoked flags on a group are the initial signal, but a group's continued activity status is a genuine judgment call, not something to auto-flip based on MITRE's dataset alone. */
  isActive: boolean;
  /** Loose references to ThreatPattern.id, same "free-text/simple-array reference, not a join table" shape ThreatPattern.relatedPatternIds already uses for a comparable loose association. */
  relatedPatternIds: string[] | null;
  /**
   * Staff-curated, not synced from MITRE -- MITRE's own official STIX
   * data has no structured geographic fields at all, only unstructured
   * prose inside the description (e.g. "attributed to Russia's
   * Foreign Intelligence Service"). An analyst reads that same text,
   * confirms what it actually says, and tags it -- same "staff
   * judgment call, not auto-derived" principle as isActive. Free text,
   * matching organization_profiles.country's own existing shape, not
   * a closed enum or ISO code list. Preserved across re-sync exactly
   * like isActive already is.
   */
  originCountry: string | null;
  targetedCountries: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ThreatActorSearchQuery {
  source?: ThreatActorSource;
  isActive?: boolean;
  text?: string;
  /** For distribution sync -- only actors updated at or after this time. Same cursor shape as ThreatPatternSearchQuery.updatedSince. */
  updatedSince?: Date;
  limit?: number;
}

export type IntelligenceReportStatus = "draft" | "published";

/**
 * A genuinely distinct concept from Threat Advisories
 * (advisoryGeneration.ts) -- see 0057_intelligence_reports.sql for the
 * full reasoning. An Advisory is short, tactical, mechanically
 * generated from exactly one verified ThreatPattern, and distributed
 * to customers. A Report is longer-form analyst prose that can
 * synthesize across many patterns/actors/CVEs at once, and stays a
 * staff knowledge-base artifact -- not routed through
 * Announcements/Publishing in this first pass.
 */
export interface IntelligenceReport {
  id: string;
  title: string;
  summary: string;
  body: string;
  relatedPatternIds: string[] | null;
  relatedActorIds: string[] | null;
  relatedVulnerabilityCveIds: string[] | null;
  status: IntelligenceReportStatus;
  authoredByStaffId: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntelligenceReportSearchQuery {
  status?: IntelligenceReportStatus;
  text?: string;
  limit?: number;
}

export type CampaignSource = "mitre_attack" | "staff_curated";

/**
 * MITRE's own definition: "a grouping of intrusion activity conducted
 * over a specific period of time with common targets and objectives
 * ... that may or may not be linked to a specific threat actor."
 * Verified against MITRE's own Campaign STIX object type (added
 * ATT&CK v12) before building this, not assumed -- see
 * 0058_campaigns.sql for the full reasoning, including why this
 * shares mitreAttackAdapter.ts's existing STIX bundle rather than
 * needing a new source.
 *
 * A genuinely distinct concept from ThreatActor (a named group) and
 * ThreatPattern (a technical detection signature): a Campaign is a
 * time-bounded operation, sometimes attributed to one or more actors,
 * sometimes not.
 */
export interface Campaign {
  id: string;
  /** MITRE's own campaign identifier, e.g. "C0014" -- null for a staff-curated campaign not (yet) in MITRE's catalog. */
  mitreCampaignId: string | null;
  name: string;
  aliases: string[] | null;
  description: string;
  source: CampaignSource;
  /** MITRE's own documentation: meaningful only to month/year granularity for MITRE-sourced campaigns -- the day/time portion of this timestamp should be ignored when displaying ATT&CK campaign data. */
  firstSeen: Date | null;
  lastSeen: Date | null;
  /** Resolved from MITRE's own "attributed-to" STIX relationship at ingestion time -- see mitreAttackAdapter.ts. A loose cross-reference to ThreatActor.id, not a live foreign key. */
  attributedActorIds: string[] | null;
  isActive: boolean;
  /**
   * Staff-curated, not synced from MITRE -- same reasoning as
   * ThreatActor's own originCountry/targetedCountries doc comment.
   * MITRE's own Campaign descriptions do sometimes name targeted
   * countries in prose, but not as structured data; an analyst
   * confirms and tags it. Preserved across re-sync exactly like
   * isActive already is.
   */
  originCountry: string | null;
  targetedCountries: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignSearchQuery {
  source?: CampaignSource;
  isActive?: boolean;
  text?: string;
  updatedSince?: Date;
  limit?: number;
}

/**
 * MITRE ATT&CK's own technique-level taxonomy -- verified against
 * MITRE's own USAGE.md before building this, not assumed. Techniques
 * and sub-techniques are both represented as `attack-pattern` STIX
 * objects in the exact same bundle already fetched for Threat Actors
 * and Campaigns; this is the deliberately-deferred piece named when
 * Threat Actors was first built.
 *
 * See 0059_techniques.sql for the full reasoning, including why
 * `tactics` is a plain string list rather than a foreign key to a
 * separate Tactic entity, and why usage attribution is direct-only,
 * not the transitive campaign-attributed-to-group combination MITRE's
 * own documentation treats as a separate, more involved computation.
 */
export interface Technique {
  id: string;
  /** MITRE's own technique identifier, e.g. "T1566" or "T1566.001" for a sub-technique -- null for a technique missing a mitre-attack external_reference (rare, same handling as ThreatActor.mitreGroupId). */
  mitreTechniqueId: string | null;
  name: string;
  description: string;
  /** Tactic shortnames this technique belongs to, e.g. ["initial-access"], resolved from the technique's own kill_chain_phases. A technique can belong to more than one tactic. */
  tactics: string[] | null;
  isSubtechnique: boolean;
  /** The parent technique's own mitreTechniqueId (e.g. "T1566" for sub-technique "T1566.001") -- null for a top-level technique. A loose reference, not a foreign key, same reasoning as every other cross-reference in this module. */
  parentMitreTechniqueId: string | null;
  platforms: string[] | null;
  /** Direct usage only, resolved from MITRE's own "uses" relationships -- not the transitive set that also includes techniques used by a group's attributed campaigns. */
  usedByActorMitreGroupIds: string[] | null;
  usedByCampaignMitreCampaignIds: string[] | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TechniqueSearchQuery {
  tactic?: string;
  isSubtechnique?: boolean;
  isActive?: boolean;
  text?: string;
  updatedSince?: Date;
  limit?: number;
}

export type MalwareSource = "mitre_attack" | "staff_curated";
export type SoftwareType = "malware" | "tool";

/**
 * MITRE ATT&CK's own "Software" category -- verified against real
 * STIX examples and MITRE's own USAGE.md ("software are the union of
 * two STIX types, tool and malware") before building this, not
 * assumed. Lives in the exact same STIX bundle already fetched for
 * Threat Actors, Campaigns, and Techniques.
 *
 * softwareType distinguishes MITRE's own two STIX types this unifies
 * -- MITRE's own website groups both under one "Software" heading;
 * this module follows that precedent under the name the original
 * module list used ("Malware Intelligence"), not a separate "tool"
 * concept nobody asked for.
 *
 * See 0067_malware.sql for the full reasoning on the three
 * independent directions of usage resolution -- more than any other
 * module in this set, since a piece of malware can be used by a
 * Group, used by a Campaign, AND itself use one or more Techniques.
 */
export interface Malware {
  id: string;
  /** MITRE's own software identifier, e.g. "S0331" -- null for staff-curated malware not (yet) in MITRE's own catalog. */
  mitreSoftwareId: string | null;
  name: string;
  aliases: string[] | null;
  description: string;
  softwareType: SoftwareType;
  source: MalwareSource;
  platforms: string[] | null;
  /** Direct usage only, resolved from MITRE's own "uses" relationships -- not the transitive set that also includes malware used by a group's attributed campaigns. */
  usedByActorMitreGroupIds: string[] | null;
  usedByCampaignMitreCampaignIds: string[] | null;
  /** The techniques this malware itself uses, e.g. a trojan that performs credential dumping -- resolved from the same "uses" relationship type, this time with malware/tool as the source rather than the target. */
  usesMitreTechniqueIds: string[] | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MalwareSearchQuery {
  softwareType?: SoftwareType;
  source?: MalwareSource;
  isActive?: boolean;
  text?: string;
  updatedSince?: Date;
  limit?: number;
}

export type IocType = "ip" | "domain" | "url" | "email" | "file_hash_md5" | "file_hash_sha1" | "file_hash_sha256";
export type IocSource = "staff_curated" | "threatfox";

/**
 * Structured indicators of compromise -- IPs, domains, URLs, email
 * addresses, file hashes. Investigated a real external source
 * (ThreatFox, abuse.ch's own IOC-sharing platform) before building
 * this; unlike NVD or MITRE ATT&CK, it requires a registered
 * Auth-Key, so this first pass is staff-curated only, confirmed with
 * the user rather than built quietly around a missing key -- see
 * 0070_iocs.sql for the full reasoning, including why `source`
 * already models a future "threatfox" value even though only
 * "staff_curated" is reachable today.
 */
export interface Ioc {
  id: string;
  iocType: IocType;
  /** The actual indicator -- an IP, domain, URL, email address, or hash. Unique per (iocType, value); see 0070_iocs.sql for why type-scoped, not globally unique. */
  value: string;
  /** Free text, e.g. "botnet C2", "payload delivery", "phishing infrastructure" -- deliberately not a closed enum, see 0070_iocs.sql. */
  threatType: string | null;
  description: string | null;
  source: IocSource;
  relatedPatternIds: string[] | null;
  relatedActorIds: string[] | null;
  relatedCampaignIds: string[] | null;
  relatedMalwareIds: string[] | null;
  isActive: boolean;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  createdByStaffId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IocSearchQuery {
  iocType?: IocType;
  source?: IocSource;
  isActive?: boolean;
  text?: string;
  limit?: number;
}
