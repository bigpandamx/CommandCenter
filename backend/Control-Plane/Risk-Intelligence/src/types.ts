/**
 * Network-level risk intelligence: deterministic, rule-based insight
 * generation over cross-org risk signal aggregates, adapted from Aegis's
 * `RiskIntelligenceService`. That service is genuinely different from
 * `network_intelligence.py` (Threat-Intelligence's source) -- it's
 * per-org analytics over one organization's own RiskScore history
 * (spike/trend/root-cause/correlation detection), and it's correctly
 * scoped to stay in Aegis: it operates entirely within one org's data,
 * there's nothing cross-tenant about it.
 *
 * What's built here is a genuine adaptation, not a migration: the same
 * four-detector pipeline (anomaly/trend/root_cause/correlation) and the
 * same threshold formulas, applied to Command Center's cross-org
 * RiskSignalAggregate data (Control-Plane/Threat-Intelligence, Phase 3)
 * instead of one org's RiskScore rows, keyed by industry instead of
 * org_id. This produces insights no single Aegis deployment could
 * compute on its own -- "risk signals are spiking across the technology
 * industry this week" requires seeing across orgs, which only Command
 * Center does.
 *
 * Adaptation mapping from Aegis's original:
 *   - org_id                    -> industry
 *   - RiskScore.overall_score   -> RiskSignalAggregate.avgSeverityScore
 *     (0-1 scale here vs. Aegis's 0-100; scaled by *100 internally so
 *     Aegis's exact numeric thresholds -- baseline minimum 5, severity
 *     bands at 80/60/40 -- apply unchanged)
 *   - dominant risk *component* (CR/MR/BR/...)  -> dominant *signalType*
 *     (deployment_failure/policy_violation/...) by share of total
 *     signal volume -- Command Center doesn't have Aegis's per-score
 *     component breakdown, but signalType dominance is the same kind of
 *     question: "which risk dimension explains this?"
 *   - model/user concentration  -> organization-hash concentration --
 *     "is this industry's elevated risk driven by many orgs a little,
 *     or a few orgs a lot?" is answerable from hashed org identity
 *     without deanonymizing anyone, and is the direct cross-org analog
 *     of Aegis's "is this concentrated on one model/user?" question.
 */

/**
 * The four types detectors.ts itself computes from aggregated
 * cross-org signal data -- what RiskModel/resolveActiveModelParameters
 * are genuinely about, since only these have a THRESHOLD to tune at
 * all. Kept as its own, narrower alias (rather than using InsightType
 * directly for RiskModel's own detectorType) so DEFAULTS_BY_DETECTOR_TYPE
 * stays an exhaustive, correct Record -- "external_signal" insights
 * never go through Risk Models, since NVD's own CVSS severity isn't a
 * threshold Command Center computes or could tune.
 */
export type DetectorGeneratedInsightType = "anomaly" | "trend" | "root_cause" | "correlation";

/**
 * "external_signal": a significant, discrete EVENT reported by an
 * outside source (a critical CVE, a KEV-listed vulnerability) --
 * genuinely different from the other four, which are all PATTERNS
 * detected by computing something over aggregated data. None of
 * anomaly/trend/root_cause/correlation honestly describes "NVD
 * published a critical CVE" -- that's not a spike, a trend, a
 * dominant signal type, or a concentration, it's a single fact
 * already classified as significant by the source itself. See
 * externalSignalIngestion.ts's own doc comment for what actually
 * produces this type and why.
 */
export type InsightType = DetectorGeneratedInsightType | "external_signal";
export type InsightSeverity = "critical" | "high" | "medium" | "low";

export interface NetworkRiskInsight {
  id: string;
  industry: string;
  type: InsightType;
  severity: InsightSeverity;
  summary: string;
  explanation: string;
  contributingFactors: Record<string, unknown>;
  recommendation: string;
  confidence: number;
  /** RiskSignalAggregate ids this insight was computed from -- lets a reviewer trace an insight back to its source data. */
  linkedAggregateIds: string[];
  isResolved: boolean;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface InsightSearchQuery {
  industry?: string;
  type?: InsightType;
  severity?: InsightSeverity;
  isResolved?: boolean;
  limit?: number;
}

/**
 * Risk Factors: a named taxonomy of risk DIMENSIONS ("AI Model Risk,"
 * "Vendor Risk," "Data Governance Risk," "Concentration Risk") --
 * deliberately NOT built as a Controls-shaped concept, even though the
 * CRUD scaffolding (key/name/description/timestamps) looks like every
 * other named entity in this codebase. The relationship direction is
 * genuinely different, not just relabeled: a ComplianceFramework
 * REQUIRES its linked controls (an external mandate defines what MUST
 * exist, top-down). A RiskFactor does not require anything from a
 * NetworkRiskInsight -- insights are detected first, algorithmically,
 * bottom-up, by Risk-Intelligence's own detectors; a RiskFactor is a
 * classification lens applied afterward, by a staff member, to
 * organize and aggregate what's already been detected. There is no
 * "this risk factor isn't satisfied" state the way an unmapped
 * compliance obligation is a real gap -- an insight simply isn't
 * classified yet, which is a normal, unremarkable state, not a
 * finding.
 *
 * Deliberately does NOT touch Controls or Frameworks at all -- Risk
 * Factors classify risk INSIGHTS, a Risk-Intelligence concept;
 * Controls satisfy compliance OBLIGATIONS, a Compliance concept. Two
 * genuinely separate taxonomies for two genuinely separate questions
 * ("what threats/exposure exist" vs. "what does the law require"),
 * kept separate rather than merged for scaffolding convenience.
 *
 * Assignment (linking an insight to a factor) is a staff action, not
 * an automatic classifier -- consistent with NetworkRiskInsight's own
 * existing design (purely algorithmic detection, no automated
 * verification concept anywhere in the model). Building an automatic
 * insight-to-factor classifier is explicitly a Risk MODELS concern
 * (the next stage in this pipeline, not attempted here) -- it would
 * need real scoring/matching logic, not a taxonomy.
 */
export interface RiskFactor {
  id: string;
  /** Stable identifier, e.g. "ai-model-risk". */
  key: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RiskFactorSummary {
  riskFactorId: string;
  riskFactorKey: string;
  riskFactorName: string;
  /** How many insights are currently classified under this factor, resolved or not -- overall prevalence. */
  totalLinkedInsights: number;
  /** Of those, how many are still unresolved -- current, active exposure under this risk dimension, not a historical count. Deliberately a DIFFERENT kind of stat from ComplianceFramework's own coverage (which measures completeness of a REQUIRED set) -- this measures activity/prevalence, since a RiskFactor doesn't require anything to be "covered" in the first place. */
  unresolvedLinkedInsights: number;
}

/**
 * Risk Models: the scoring methodology stage of the proposed pipeline
 * (Risk Factors -> Risk Models -> Risk Assessments), extracted
 * directly from what detectors.ts already computes -- not an abstract
 * scoring framework invented on top of it. Every one of detectors.ts's
 * own hardcoded thresholds (baseline minimum 5, spike >20%, severity
 * bands at 80/60/40, ...) was already documented there as matching
 * Aegis's own `risk_intelligence_service.py` exactly. This type makes
 * those same, already-proven numbers a real, staff-inspectable,
 * staff-editable configuration instead of magic constants buried in
 * detector functions -- the numbers aren't fabricated, they're the
 * literal values already running, just given a name and a place to
 * live.
 *
 * One model per detector type (anomaly/trend/root_cause/correlation),
 * not a single generalized "risk score formula" -- because that's
 * what's actually true today: each detector has its own, genuinely
 * independent threshold set, not shared math. Forcing them into one
 * unified "model" shape would misrepresent what's really four
 * separate, independently-tunable algorithms.
 *
 * Deliberately NOT versioned in this round -- one row per detector
 * type, edited in place, `updatedAt` tracked but no historical
 * snapshot kept. A real, stated scope boundary: audit-trailed
 * threshold history is a reasonable future need, not attempted here.
 */
export type RiskModelParameters =
  | {
      detectorType: "anomaly";
      minPoints1h: number;
      minPoints24h: number;
      baselineMinimum: number;
      spikeThresholdPct: number;
      severityCriticalPct: number;
      severityHighPct: number;
    }
  | {
      detectorType: "trend";
      minPoints7d: number;
      minPoints14d: number;
      baselineMinimum: number;
      trendThresholdPct: number;
      severityHighPct: number;
      severityMediumPct: number;
    }
  | {
      detectorType: "root_cause";
      minPoints24h: number;
      dominanceThresholdPct: number;
      severityCriticalScore: number;
      severityHighScore: number;
      severityMediumScore: number;
    }
  | {
      detectorType: "correlation";
      minPoints24h: number;
      avgScoreMinimum: number;
      concentrationThresholdPct: number;
      severityHighScore: number;
    };

export interface RiskModel {
  id: string;
  /** Stable identifier, e.g. "standard-anomaly-detection". */
  key: string;
  name: string;
  description: string;
  parameters: RiskModelParameters;
  /** Only one model may be active per detectorType at a time -- see resolveActiveModelParameters's own doc comment for what happens when none is. */
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Risk Assessments: a persisted SNAPSHOT of an industry's standing
 * exposure -- "what is our exposure, right now, and how has it
 * changed" -- not a new fact to track the way an Obligation or Control
 * is. Deliberately a computed AGGREGATE over NetworkRiskInsight rows
 * that already exist, not a heavyweight new entity built by analogy to
 * Compliance's own artifacts; the only reason this persists at all
 * (rather than being computed live on demand, the way
 * computeRiskFactorSummary already is) is the explicit choice to
 * support real trend tracking over time ("was this better or worse 30
 * days ago") -- a live-only computation could never answer that.
 *
 * Scoped to one industry per snapshot -- the same scope
 * NetworkRiskInsight itself already uses, and the level "what is our
 * exposure" was always framed at throughout this pipeline (industry-
 * wide, cross-org), not per-organization.
 *
 * exposureScore is a real, stated, adjustable formula -- not a claim
 * of scientific precision. See riskAssessmentService.ts's own doc
 * comment for the exact weights and why they were chosen, and for
 * why only UNRESOLVED insights count toward current exposure (a
 * resolved insight no longer represents standing risk, even though it
 * remains in the historical record).
 */
export type ExposureLevel = "low" | "medium" | "high" | "critical";

export interface RiskAssessment {
  id: string;
  industry: string;
  assessedAt: Date;
  exposureScore: number;
  exposureLevel: ExposureLevel;
  /** Which unresolved insights fed into this snapshot -- traceability, the same role linkedAggregateIds plays on NetworkRiskInsight itself. */
  contributingInsightIds: string[];
}

/**
 * Risk Treatments: the stage this whole pipeline was named as most
 * likely to accidentally become Controls with a different label, so
 * the distinction is enforced structurally here, not just asserted in
 * a comment. `treatmentType` uses the standard ISO 31000 vocabulary
 * (avoid/mitigate/transfer/accept) -- a real, established taxonomy,
 * not invented for this codebase. "accept" is the load-bearing member
 * of that set: a treatment whose entire content IS the decision to do
 * nothing, and that's a genuinely valid, complete, first-class
 * outcome -- not a fallback or a missing value. Compliance has no
 * equivalent state; an obligation can't be "accepted" instead of
 * satisfied, because an external mandate doesn't care whether Command
 * Center consents to it. A risk, unlike an obligation, can be
 * knowingly and legitimately left as-is.
 *
 * An insight having zero treatments is an ordinary, unremarkable
 * state, the same way an insight having zero risk-factor
 * classifications is -- NOT a gap, NOT "uncovered," NOT tracked as a
 * deficiency anywhere in this module. There is deliberately no
 * "treatment coverage" stat anywhere in riskTreatmentService.ts, on
 * purpose -- computing one would smuggle Compliance's own "unmapped
 * obligation is a finding" framing back in under a new name.
 *
 * Tied to a specific NetworkRiskInsight, not to a RiskFactor or an
 * industry -- a treatment responds to a concrete, detected issue, the
 * same level `NetworkRiskInsight.recommendation` (a free-text
 * suggestion) already operates at. This is that same idea, made
 * trackable: proposed by a specific staff member, with a real status,
 * rather than a sentence that exists only inside the insight's own
 * explanation text.
 */
export type RiskTreatmentType = "avoid" | "mitigate" | "transfer" | "accept";
export type RiskTreatmentStatus = "proposed" | "in_progress" | "completed";

export interface RiskTreatment {
  id: string;
  insightId: string;
  treatmentType: RiskTreatmentType;
  description: string;
  status: RiskTreatmentStatus;
  proposedByStaffId: string;
  proposedAt: Date;
  /** Set once status reaches "completed" -- for an "accept" treatment this is typically the same moment as proposedAt, since accepting IS the completed action, not the start of one. */
  completedAt: Date | null;
}

/**
 * Risk Knowledge: the platform-wide, staff-maintained catalogs this
 * pipeline draws its own vocabulary from -- Threat Types, Risk Types,
 * Treatments (which "Mitigations," as originally proposed, is a
 * subset of -- see treatmentType below), and Industries. Grows over
 * time, staff-authored, browsable -- the same shape ComplianceFramework
 * and RiskFactor already use (key/name/description), unified into one
 * entity with a category discriminator rather than four
 * near-identical files, since the underlying pattern really is the
 * same catalog shape repeated four times, not four different things.
 *
 * Deliberately does NOT include Business Assets or Dependencies, even
 * though they were named alongside these in the original proposal --
 * both are a genuinely different shape. A catalog entry here is
 * platform-wide (one shared list every org's insights and treatments
 * draw from); a Business Asset is inherently org-specific (each
 * organization has its own). A catalog entry is a standalone named
 * thing; a Dependency is a relationship BETWEEN things, not a
 * standalone entry at all. Forcing either into this same flat shape
 * would blur a real distinction rather than simplify anything -- both
 * are real, separate future work.
 */
export type RiskKnowledgeCategory = "threat_type" | "risk_type" | "treatment" | "industry";

export interface RiskKnowledgeEntry {
  id: string;
  category: RiskKnowledgeCategory;
  /** Unique within its own category, not globally -- "openai" as an industry entry and "openai" as a threat_type entry (hypothetically) don't collide, since they're conceptually separate namespaces. */
  key: string;
  name: string;
  description: string;
  /**
   * Only meaningful when category is "treatment" -- which of the four
   * ISO 31000 types (the same vocabulary RiskTreatment itself already
   * uses) this catalog entry represents. "Mitigations," as named in
   * the original proposal, are simply treatment-category entries with
   * treatmentType "mitigate" -- not a separate top-level category,
   * since a mitigation is definitionally a kind of treatment, not a
   * parallel concept sitting beside it.
   */
  treatmentType: RiskTreatmentType | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Business Assets: what an organization actually has that can be at
 * risk -- "Customer Database," "Production API," "Payment Processing
 * System." Deliberately kept OUT of RiskKnowledgeEntry's own unified
 * catalog (see that type's own doc comment) precisely because this is
 * the opposite shape: not a shared, platform-wide vocabulary every
 * org draws from, but a real, one-off inventory each organization has
 * its own copy of. Acme's "Customer Database" and Widget Co's
 * "Customer Database" are two unrelated rows, not the same catalog
 * entry referenced twice.
 *
 * Staff-managed via an admin route, the same way OrganizationProfile
 * itself is today -- not a customer self-service surface, since
 * Command Center is a staff-facing tool throughout. In practice this
 * gets filled in from what staff learn during onboarding/account
 * conversations, the same way industry/country get recorded.
 *
 * Deliberately does NOT include any relationship to a vendor, risk
 * factor, or another asset -- that's Dependencies, the other item
 * scoped out of Risk Knowledge for the same reason (a genuinely
 * different, relational shape), and real, separate future work, not
 * attempted here. A Business Asset on its own is just a named,
 * described, criticality-rated thing an org has -- nothing it points
 * to yet.
 */
export type AssetCriticality = "low" | "medium" | "high" | "critical";

export interface BusinessAsset {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  /** Open vocabulary, not a closed enum -- e.g. "database," "api," "physical-device," "process," "vendor-service." A new kind of asset shouldn't require a schema migration to record. */
  category: string;
  criticality: AssetCriticality;
  /** Decommissioned assets are deactivated, not deleted -- a past risk assessment or treatment that referenced this asset should still resolve to something real, the same reasoning ComplianceSource itself already uses for isActive over hard deletion. */
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** The three vendor-footprint dimensions OrganizationProfile discloses -- moved here (rather than staying local to vendorImpactService.ts, where it originated) once AssetDependency also needed it, so both files import one shared definition instead of vendorImpactService.ts's own copy drifting from a second one. */
export type VendorCategory = "cloud" | "ai" | "device";

/**
 * Dependencies: the relationship layer Business Assets was
 * deliberately built without -- see that type's own doc comment. What
 * turns "a critical OpenAI outage" from "here are the organizations
 * that use OpenAI" (vendorImpactService.ts, already built) into "and
 * here are the SPECIFIC SYSTEMS of theirs that would actually break."
 *
 * A dependency points at exactly one of two genuinely different
 * targets, discriminated by targetType: another BusinessAsset within
 * the same organization (e.g. "Payment Processing" depends on
 * "Customer Database"), or a vendor (e.g. "AI Support Triage" depends
 * on OpenAI as an AI provider) -- the same open-vocabulary vendor
 * concept OrganizationProfile.aiProviders/cloudProviders/deviceTypes
 * and vendorImpactService.ts already use, not re-invented here. Only
 * the fields for whichever target type applies are populated; the
 * other target's fields stay null, enforced at the service layer the
 * same way RiskKnowledgeEntry's own treatmentType is.
 *
 * Deliberately does NOT validate that a vendor dependency's
 * targetVendor already appears in the organization's own disclosed
 * profile -- staff may record a dependency before the profile catches
 * up, and a dependency can itself be how a previously-undisclosed
 * vendor gets noticed. The vendor name here is free text, the same
 * open vocabulary the profile fields already use.
 *
 * A direct A-depends-on-B and B-depends-on-A pair is rejected (see
 * assetDependencyService.ts) -- but this is NOT full multi-hop cycle
 * detection across longer chains (A -> B -> C -> A), which is real,
 * separate, harder graph-algorithm work, not attempted here. Likewise,
 * cascade queries in this round go exactly one hop deep -- "what
 * directly depends on this vendor/asset" -- not a full transitive
 * closure. Both are stated scope boundaries, not oversights.
 */
export interface AssetDependency {
  id: string;
  /** Denormalized from the dependent asset's own organizationId, for query convenience -- avoids a join on every org-scoped lookup. */
  organizationId: string;
  dependentAssetId: string;
  targetType: "asset" | "vendor";
  /** Populated only when targetType is "asset". */
  targetAssetId: string | null;
  /** Populated only when targetType is "vendor" -- open vocabulary, e.g. "openai". */
  targetVendor: string | null;
  targetVendorCategory: VendorCategory | null;
  description: string;
  /** How badly the DEPENDENT asset suffers if this specific target goes down -- not the target's own importance, the dependency's. */
  criticality: AssetCriticality;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Playbooks: the one genuinely new piece of the Risk Library, kept
 * deliberately OUT of RiskKnowledgeEntry's unified catalog rather than
 * folded in as a fifth category. Every existing category there is a
 * single named thing (a type, a mitigation, a threshold) -- flat,
 * key/name/description. A playbook is a PROCEDURE: an ordered sequence
 * of response steps, a genuinely different shape, the same reasoning
 * that already kept Business Assets and Dependencies out.
 *
 * Steps are stored as an ordered array on the playbook itself, not as
 * separate rows in their own table -- they're never queried
 * independently of their playbook, always edited and read as a unit,
 * the same reasoning RiskModel.parameters already uses for its own
 * JSONB storage over a normalized child table.
 *
 * Platform-wide, not org-scoped -- "Vendor Outage Response" is a
 * reusable procedure every relevant organization's incident draws on,
 * not a one-off per-org record the way a BusinessAsset is.
 *
 * Linked to Risk Factors many-to-many (the same junction-table shape
 * insight_risk_factors already uses) -- "is there a playbook for this
 * kind of risk" is the real question this link answers. A playbook
 * with no linked factors yet is an ordinary draft state, not a gap.
 */
export interface PlaybookStep {
  title: string;
  description: string;
}

export interface Playbook {
  id: string;
  key: string;
  name: string;
  description: string;
  /** Ordered by array position -- step 1 is index 0. Can be empty -- a playbook staff is still drafting, not yet ready to link or use. */
  steps: PlaybookStep[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Cloud/AI provider outages: the fourth signal source, and the first
 * genuinely new one -- CVE, MITRE campaign, and compliance obligation
 * data all already existed elsewhere in this codebase before being
 * wired into Risk Intelligence's own detection layer; nothing like
 * this existed anywhere before this round.
 *
 * Deliberately STAFF-REPORTED, not live-ingested from a real provider
 * status page. AWS's Health Dashboard, Azure's Status page, and GCP's
 * own incident feed each have a genuinely different live API shape,
 * none of which can be verified against a current, real spec without
 * network access this environment doesn't have. Building a fake
 * "adapter" against a format assumed from training data, with no way
 * to confirm it's still accurate, would be fabricating exactly the
 * kind of unverifiable capability this codebase has consistently
 * avoided elsewhere (see NVD/MITRE's own adapters, which were built
 * against real, stable, versioned, well-documented specs, not
 * guessed at). Staff-reported is not a lesser substitute -- it's the
 * same legitimate pattern ThreatActorSource's own "staff_curated"
 * value already establishes as a first-class data source, not a
 * live-ingestion fallback.
 *
 * vendor/category reuse VendorCategory and the same open-vocabulary
 * vendor strings OrganizationProfile.cloudProviders/aiProviders/
 * deviceTypes and vendorImpactService.ts already use -- deliberately
 * NOT a new, separate vocabulary, since the entire point of this
 * entity is to connect to that already-built machinery, not duplicate
 * it under a different name.
 *
 * No batch ingestion job, no cursor, no per-entity dedup guard the way
 * CVE/campaign/compliance ingestion needed -- staff reports ONE
 * specific outage at a time, an explicit, singular action, not a
 * recurring sync against an external source that could resurface the
 * same record. reportOutage (see cloudOutageService.ts) generates its
 * NetworkRiskInsight in the same call, not a separate step -- the act
 * of a staff member reporting the outage IS the confirmation, the same
 * role the click itself plays in Risk Notices' own Generate Notice.
 */
export interface CloudProviderOutage {
  id: string;
  /** Open vocabulary, e.g. "openai", "aws" -- the same vendor identifier OrganizationProfile's own vendor fields use. */
  vendor: string;
  category: VendorCategory;
  title: string;
  description: string;
  severity: InsightSeverity;
  /** e.g. ["Chat Completions API", "EC2 us-east-1"] -- open text, staff's own account of what's actually affected. */
  affectedServices: string[];
  startedAt: Date;
  isResolved: boolean;
  resolvedAt: Date | null;
  /** A link to the provider's own status page or announcement, when staff has one -- not required, since staff may be reporting from a support ticket or direct notice with no public URL. */
  sourceUrl: string | null;
  reportedByStaffId: string;
  createdAt: Date;
  updatedAt: Date;
}
