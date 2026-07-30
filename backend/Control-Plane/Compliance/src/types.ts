/**
 * Compliance intelligence: tracks regulatory news, new/amended laws,
 * agency guidance, and enforcement actions relevant to AI governance
 * (EU AI Act, NIST AI RMF, GDPR/CCPA, sector-specific AI rules, etc.),
 * pulled from external sources and made available for Aegis to consume.
 *
 * This is platform-wide reference content, not org-scoped -- a new EU AI
 * Act amendment is the same fact regardless of which Aegis customer is
 * looking at it. Compare to update_manifests (0001) and subscription_plans
 * (0004), the other global catalogs in this schema.
 *
 * Normalization schema, restructured this session around the pipeline
 * framing (Collection -> Normalization -> AI Analysis -> Knowledge Base
 * -> Impact Assessment -> Distribution): the normalized shape below is
 * what every collector maps into and everything downstream reads --
 * documents are stored as structured knowledge, not "a title, a link,
 * and a jurisdiction blob." `country`/`state`/`industries` are
 * genuinely new fields (not renames); `documentType` renames the old
 * `category` for clarity, same values, no semantic change; `content`
 * (full document body/text, when a source provides it inline) and
 * `effectiveDate` (when a document takes/took legal effect, distinct
 * from when it was published) are new.
 *
 * Several of these fields are honestly, deliberately nullable/empty
 * rather than guessed. Generic RSS/Atom feeds don't structurally
 * declare country, state, industries, effective date, or document type
 * -- an adapter that doesn't know these leaves them null/empty, not a
 * fabricated best guess. Determining them from a document's actual
 * content (not its feed metadata) is the AI Analysis layer's job, not
 * this one's -- named as the next stage in the pipeline, not built yet.
 *
 * IMPORTANT: source URLs/endpoints here were not verified against live
 * network access (none available in the environment this was built in --
 * no web_search tool, no outbound network from the sandbox). Verify each
 * source's URL and response shape against current documentation before
 * enabling it in production. See adapters/ for what's genuinely tested
 * (parsing logic against hand-written sample data) vs. what's an
 * unexecuted best-effort based on training knowledge (the live fetch
 * itself).
 */

/** "manual" has no automated fetch adapter at all -- see 0038_compliance_source_management.sql's own comment for why (regulatory bodies with no machine-readable feed; staff add updates by hand instead). */
export type ComplianceSourceType = "rss" | "atom" | "json_api" | "manual";

export type ComplianceDocumentType =
  | "new_law"
  | "amendment"
  | "proposed_rule"
  | "guidance"
  | "enforcement_action"
  | "news";

export interface ComplianceSource {
  id: string;
  name: string;
  /** e.g. "US-Federal", "EU", "US-CA", "Global" -- free text, not a closed enum, since jurisdictions are numerous and this list will grow without code changes. Descriptive metadata about what the SOURCE covers, not used directly for per-org impact matching -- that's ComplianceUpdate's structured country/state, see ingestion.ts's parseUsJurisdiction for the one place this free text gets parsed, narrowly and honestly. */
  jurisdiction: string;
  /** e.g. ["EU_AI_ACT"], ["NIST_AI_RMF", "GDPR"] -- which frameworks this source's content tends to relate to. Informational tagging, not a hard filter. */
  frameworkTags: string[];
  sourceType: ComplianceSourceType;
  url: string;
  isActive: boolean;
  lastFetchedAt: Date | null;
  lastFetchStatus: "never_run" | "success" | "error";
  lastFetchError: string | null;
  /** Staff-recorded intent (e.g. 60 = "check hourly"), not yet enforced by a real cron -- see 0038_compliance_source_management.sql's own comment. Null means no schedule recorded, which is the honest default: the scheduler that would read this doesn't exist yet either. */
  scheduleIntervalMinutes: number | null;
  createdAt: Date;
}

/**
 * The Incoming Queue's states -- see 0039_compliance_update_status.sql
 * for the full reasoning, including why there are five states, not
 * six ("new" covers both "just ingested" and "pending AI analysis" --
 * this system has no real async analysis queue to represent a
 * distinct intermediate state for).
 */
export type ComplianceUpdateStatus = "new" | "pending_review" | "duplicate" | "rejected" | "published";

export interface ComplianceUpdate {
  id: string;
  sourceId: string;
  /** Dedup key -- the feed/API's own item identifier (RSS guid, Atom id, Federal Register document_number). Unique per source, not globally. */
  externalId: string;
  documentType: ComplianceDocumentType;
  /** ISO 3166-1 alpha-2 (e.g. "US", "DE"), when known. Null when the source/adapter can't determine it from the item itself -- most RSS feeds don't structurally self-declare this; left null rather than guessed. See ingestion.ts's parseUsJurisdiction for the one narrow, deterministic fallback this codebase applies (parsing a source's own "US-XX"/"US-Federal" jurisdiction convention), not a general inference. */
  country: string | null;
  /** Free text (e.g. "CA", "NY") -- only meaningful alongside a country with sub-national jurisdictions. Null when not applicable or not determinable. */
  state: string | null;
  /** Open vocabulary (e.g. ["ai", "healthcare"]), matching this codebase's established free-form-over-closed-enum convention for extensible categorization (Events' type, FeatureFlags' key, ServiceCatalog's category, Identity's kind). Empty array, not null, when undetermined -- "no known industries yet" is a valid, common state, distinct from a malformed value. */
  industries: string[];
  title: string;
  summary: string | null;
  /** Full document text/body, when the source provides it inline. Null when only a short summary is available -- never fabricated by truncating or duplicating the summary into this field. */
  content: string | null;
  url: string;
  frameworkTags: string[];
  publishedAt: Date | null;
  /** When this document takes/took legal effect -- distinct from publishedAt (when it was announced). Frequently null: most guidance/news has no effective date, and many sources don't expose this even for binding rules. */
  effectiveDate: Date | null;
  ingestedAt: Date;
  /**
   * Null means this update isn't grouped into any regulatory topic --
   * most ingested documents won't be, at least not yet. Non-null links
   * it into a ComplianceRule's History (see ruleService.ts) -- the
   * original rule, a correction, and implementation guidance can all
   * share the same ruleId, rather than existing as three disconnected
   * records.
   */
  ruleId: string | null;
  /** Defaults to "new" for every newly ingested/manually-added update -- see ComplianceUpdateStatus's own doc comment. Not read by any downstream consumer yet (impact assessment, control matching, rule grouping, distribution all still operate on every update regardless) -- see the migration's own comment for why that's a deliberate, separate decision. */
  status: ComplianceUpdateStatus;
}

/** What a source adapter produces -- the common shape ingestion.ts works with, regardless of whether it came from RSS, Atom, or a JSON API. Every field an adapter can't genuinely determine from its source's own data is null/empty/omitted, not guessed -- see this file's module doc comment. */
export interface NormalizedComplianceItem {
  externalId: string;
  title: string;
  summary: string | null;
  /** Optional -- most adapters (generic RSS/Atom) have no full body distinct from summary; omit rather than duplicate summary into this field. */
  content?: string | null;
  url: string;
  publishedAt: Date | null;
  /** Optional -- omit when the source doesn't expose an effective date. */
  effectiveDate?: Date | null;
  /** Optional -- omit when the adapter can't determine this from the item itself. */
  country?: string | null;
  /** Optional -- omit when the adapter can't determine this from the item itself. */
  state?: string | null;
  /** Optional -- omit (not empty array) when the adapter has no basis to populate this; ingestion.ts defaults to [] either way. */
  industries?: string[];
  /** Adapter's best guess at document type; defaults to "news" in ingestion.ts if omitted -- adapters aren't required to classify perfectly. */
  documentType?: ComplianceDocumentType;
}

export interface CreateComplianceSourceInput {
  name: string;
  jurisdiction: string;
  frameworkTags: string[];
  sourceType: ComplianceSourceType;
  url: string;
}

export interface IngestionSummary {
  inserted: number;
  duplicate: number;
}

/**
 * AI Analysis layer -- the pipeline stage after Normalization. Reuses
 * Customer-Connections/AIChat's AIProvider abstraction rather than
 * building AI integration a second time; this module only adds the
 * compliance-specific prompt and structured-response parsing on top.
 *
 * Deliberately a SEPARATE record from ComplianceUpdate, not fields
 * added to it or values that overwrite it: ComplianceUpdate stays the
 * normalized, adapter-derived record (what the source actually
 * declared); ComplianceAnalysis is the AI's own determination layered
 * on top, which may newly populate or refine what the adapter left
 * null/empty (most sources don't self-declare industries or whether a
 * document is AI-related) without destroying the provenance of what
 * came from the source itself vs. what was inferred. A future Impact
 * Assessment stage is expected to prefer ComplianceAnalysis's fields
 * once analysis has run, falling back to ComplianceUpdate's when it
 * hasn't -- that merge logic belongs to that stage, not this one.
 *
 * One analysis per update (re-analyzing replaces the prior one, it
 * doesn't version alongside it) -- there's no product need yet for
 * "what did the AI think last month vs. today," and adding that
 * history is a reasonable future step if one emerges, not built
 * speculatively now.
 */

export type Enforceability = "enforceable" | "informational" | "unknown";
export type ComplianceRiskLevel = "low" | "medium" | "high" | "critical";

export interface ComplianceAnalysis {
  id: string;
  updateId: string;
  isAiRelated: boolean;
  enforceability: Enforceability;
  /** AI's own determination -- see this section's module doc comment for why this doesn't overwrite ComplianceUpdate's own country/state. */
  country: string | null;
  state: string | null;
  /** Open vocabulary, same reasoning as ComplianceUpdate.industries. */
  industries: string[];
  /** Open vocabulary (e.g. ["data-privacy", "risk-management"]) -- the AI's own topic extraction, not a closed taxonomy decided ahead of time. */
  topics: string[];
  summary: string;
  riskLevel: ComplianceRiskLevel;
  actionItems: string[];
  keywords: string[];
  /** Which model actually produced this analysis -- worth knowing per-analysis, not just which provider is configured (mirrors ChatMessage.model in AIChat). */
  model: string;
  analyzedAt: Date;
}

/**
 * Knowledge Base layer -- the pipeline stage after AI Analysis. The
 * vision's hierarchy is Law -> Topics -> Obligations -> Industries;
 * Topics and Industries already exist as fields on ComplianceAnalysis
 * (added last round). Obligations is the genuinely new structure here:
 * distinct from `actionItems` (a recommendation TO a customer, e.g.
 * "Review your AI governance policy"), an Obligation is a REQUIREMENT
 * extracted FROM the document itself (e.g. "Conduct an annual AI risk
 * assessment"), each with its own industry applicability and deadline
 * -- a single document can impose several distinct obligations that
 * apply to different industries or have different deadlines, which a
 * flat actionItems list can't represent.
 *
 * One-to-many from ComplianceUpdate (each obligation is its own row,
 * not a JSON array embedded in ComplianceAnalysis), so obligations are
 * independently queryable across documents -- "everything due in the
 * next 30 days" or "everything that applies to healthcare" needs to
 * scan obligations directly, not deserialize and filter a JSON blob
 * per analysis row.
 */
/**
 * Obligation Review's states -- see 0043_obligation_review.sql for the
 * full reasoning, including why "Merge" from the original vision is
 * an action (mergedIntoObligationId), not a fourth status here.
 */
export type ObligationReviewStatus = "pending_review" | "approved" | "rejected";

export interface ComplianceObligation {
  id: string;
  updateId: string;
  description: string;
  /** Open vocabulary (e.g. "assessment", "disclosure", "registration", "reporting", "training"), same free-form-over-closed-enum reasoning as documentType's siblings elsewhere in this file. */
  obligationType: string;
  /** Which industries THIS obligation applies to -- may be a subset of the parent document's overall industries; a document can impose an obligation on healthcare specifically while other parts of the same document are general. */
  industries: string[];
  /** The AI's own free-text description of when this is due (e.g. "within 90 days of the effective date") -- kept verbatim, not parsed by the AI itself, since LLMs are unreliable at date arithmetic. */
  deadlineDescription: string | null;
  /** A concrete date, computed deterministically in application code (see parseRelativeDeadline in analysisService.ts) from deadlineDescription + the parent update's effectiveDate when the description matches a recognized relative pattern ("within N days/months/years"). Null when no deadline was given, or the description doesn't match a pattern this codebase confidently parses -- never guessed. */
  deadlineDate: Date | null;
  /** The AI's own self-reported confidence (0-100) in this extraction. Null for obligations that predate Obligation Review, or a response that omits it -- never fabricated to fill the gap. */
  confidence: number | null;
  /** Defaults to "pending_review" for every newly extracted obligation. Not read by any downstream consumer yet (control matching, impact assessment still consider every obligation regardless) -- see the migration's own comment for why that's deliberate. */
  status: ObligationReviewStatus;
  /** Set when a staff member merges this obligation into another (see obligationReviewService.ts) -- non-destructive: no fields are combined, no data is deleted. Implies status "rejected" (this record is no longer independently actionable), but the two are set together explicitly, not derived from each other. */
  mergedIntoObligationId: string | null;
  createdAt: Date;
}

/**
 * Compliance Knowledge: the layer between "thousands of disconnected
 * ingested documents" and an actual regulatory topic that evolves over
 * time. A Federal Register "AI Transparency Rule," its correction
 * published the next day, and its implementation guidance published
 * the week after are three separate ComplianceUpdate rows, linked to
 * the same ComplianceRule via ComplianceUpdate.ruleId.
 *
 * History and Current Version are deliberately not stored fields on
 * this type -- see ruleService.ts's listRuleHistory/getCurrentVersion
 * for why both are derived from the linked updates rather than
 * separately tracked state that could drift from reality.
 */
export interface ComplianceRule {
  id: string;
  /** Stable identifier, e.g. "ai-transparency-rule". */
  key: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AI-synthesized understanding of a rule considering its FULL history
 * together -- the original document, any correction, any guidance --
 * answering "what does this actually mean now," distinct from
 * ComplianceAnalysis (per-update, answers "what does THIS ONE document
 * mean"). Persisted and append-only, not replaced on regeneration:
 * unlike ComplianceAnalysis (which replaces on re-analysis because a
 * re-analyzed document's old analysis is simply wrong once superseded),
 * a rule's interpretation evolving over time IS the point -- keeping
 * prior interpretations lets a reader see how understanding of an
 * evolving rule changed as new documents came in, not just the latest
 * snapshot.
 */
export interface RuleInterpretation {
  id: string;
  ruleId: string;
  interpretation: string;
  /** What changed relative to the prior document(s) in the rule's history, e.g. "the correction narrowed the reporting deadline from 90 to 60 days." Empty for a rule's first interpretation (nothing to compare against yet). */
  keyChanges: string[];
  currentRiskLevel: ComplianceRiskLevel;
  currentActionItems: string[];
  model: string;
  /** How many updates were in the rule's history when this was generated -- the staleness signal. If listRuleHistory now returns more than this, the rule has grown since this interpretation was synthesized and it may no longer reflect the full picture. */
  basedOnUpdateCount: number;
  synthesizedAt: Date;
}

/**
 * Layer 3 of the three-layer compliance model: Legal Source
 * (ComplianceSource) -> Obligation (ComplianceObligation, extracted
 * automatically by AI) -> Control (this type). See
 * 0036_compliance_controls.sql for the full motivating reasoning --
 * a canonical, deduplicated statement of a requirement that many
 * obligations across many jurisdictions map onto, rather than every
 * obligation becoming its own unique, disconnected control.
 */
export interface ComplianceControl {
  id: string;
  /** Stable identifier, e.g. "ai-transparency". */
  key: string;
  /** Short human-facing label, e.g. "CTRL-001" -- distinct from key, matching how these are cited in practice. */
  code: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ObligationControlMappingSource = "ai" | "staff";

/**
 * One obligation mapped to one control -- see the migration's own doc
 * comment for why this is many-to-many, not many-to-one. `source`
 * distinguishes an AI-proposed mapping from a staff-asserted one, the
 * same "don't let inferred and asserted data look identical"
 * reasoning ComplianceUpdate.country already applies at the ingestion
 * layer.
 */
export interface ObligationControlMapping {
  obligationId: string;
  controlId: string;
  source: ObligationControlMappingSource;
  mappedAt: Date;
}

/**
 * The Products dimension of the original Impact Assessment vision
 * (Organization -> Region -> Products -> Industry -> AI Usage ->
 * Compliance Packs -> Affected). A pack bundles canonical Controls
 * that become relevant when an org has a specific product -- e.g. an
 * "AI Chat Compliance Pack" triggered by the org actually having that
 * product, matched independently of the country/industry matching
 * ComplianceObligation already does. See 0037_compliance_packs.sql
 * for why requiredProductKeys is a plain OR-match list, not a join
 * table, and why AI Usage isn't modeled anywhere in this schema at
 * all (no real telemetry exists to match against).
 */
export interface CompliancePack {
  id: string;
  /** Stable identifier, e.g. "ai-chat-compliance-pack". */
  key: string;
  name: string;
  description: string;
  /** ServiceCatalog service keys -- this pack is relevant if the org has ANY of these products. Empty means not yet scoped to a product. */
  requiredProductKeys: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Compliance Frameworks: named external standards (NIST AI RMF, ISO
 * 42001, ISO 27001, SOC 2, HIPAA, PCI DSS, GDPR, EU AI Act, ...) --
 * "not rules, collections of controls." See
 * 0045_compliance_frameworks.sql for the full reasoning, including why
 * this is a genuinely different concept from the existing
 * frameworkTags (informal per-document tagging, not a formal control
 * taxonomy) rather than a reuse of it.
 */
export interface ComplianceFramework {
  id: string;
  /** Stable identifier, e.g. "iso-42001". */
  key: string;
  /** The framework's own official name, e.g. "ISO/IEC 42001:2023" -- kept as one field, not split into name+version, since real frameworks cite themselves inconsistently (some by year, some without) and forcing a version field would invite fabricating one where none was given. */
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CustomerPolicyStatus = "pending_review" | "reviewed" | "rejected";

/**
 * "Customer Policy" mapping -- an org's own internal policy document
 * mapped onto the controls it covers. Explicitly deferred when
 * Controls itself was first built; see 0050_customer_policies.sql for
 * the full reasoning, including why this is a distinct concept from
 * both Governance's own Policy (platform-wide, staff-authored) and
 * AuditEvidence (a flat, unversioned supporting record).
 *
 * Structurally mirrors ComplianceFramework/CompliancePack on purpose
 * -- a named entity, many-to-many with ComplianceControl -- but always
 * scoped to one organization, since a customer policy that isn't about
 * a specific customer isn't a customer policy at all.
 */
export interface CustomerPolicy {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  documentUrl: string | null;
  status: CustomerPolicyStatus;
  submittedByStaffId: string;
  submittedAt: Date;
  reviewedByStaffId: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
}
