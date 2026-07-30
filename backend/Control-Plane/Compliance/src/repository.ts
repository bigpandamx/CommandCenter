import type { ComplianceAnalysis, ComplianceControl, CompliancePack, ComplianceFramework, ComplianceObligation, ObligationReviewStatus, ComplianceRule, ComplianceSource, ComplianceUpdate, ComplianceUpdateStatus, ObligationControlMapping, RuleInterpretation, CustomerPolicy, CustomerPolicyStatus } from "./types.js";

export interface ComplianceRepository {
  createSource(source: ComplianceSource): Promise<void>;
  getSourceById(sourceId: string): Promise<ComplianceSource | null>;
  listSources(opts?: { activeOnly?: boolean }): Promise<ComplianceSource[]>;
  updateSource(source: ComplianceSource): Promise<void>;
  deactivateSource(sourceId: string): Promise<void>;

  /** Dedup check -- externalId is unique per source, not globally. */
  getUpdateBySourceAndExternalId(sourceId: string, externalId: string): Promise<ComplianceUpdate | null>;
  getUpdateById(updateId: string): Promise<ComplianceUpdate | null>;
  appendUpdate(update: ComplianceUpdate): Promise<void>;
  listUpdates(opts?: {
    country?: string;
    state?: string;
    frameworkTag?: string;
    since?: Date;
    limit?: number;
    status?: ComplianceUpdateStatus;
  }): Promise<ComplianceUpdate[]>;
  /** Updates with no ComplianceAnalysis row yet -- what analyzeUnanalyzedUpdates works through. Newest-first isn't required here (unlike listUpdates' staff-facing ordering) since this is a work queue, not a feed -- oldest-first is the real requirement, so nothing is perpetually skipped by newer items always sorting ahead of it. */
  listUpdatesWithoutAnalysis(limit: number): Promise<ComplianceUpdate[]>;
  /** A real count, not listUpdates({status}).length -- listUpdates is limit-bounded for staff-facing paging (default 100) and would silently undercount queue depth once a backlog exceeds that. What Platform Health's queue-depth reading actually needs. */
  countUpdatesByStatus(status: ComplianceUpdateStatus): Promise<number>;

  getAnalysisForUpdate(updateId: string): Promise<ComplianceAnalysis | null>;
  /** Replaces any existing analysis for this update -- see ComplianceAnalysis's own doc comment for why this isn't versioned. */
  upsertAnalysis(analysis: ComplianceAnalysis): Promise<void>;

  listObligationsForUpdate(updateId: string): Promise<ComplianceObligation[]>;
  getObligationById(obligationId: string): Promise<ComplianceObligation | null>;
  /** Replaces ALL obligations previously extracted for this update -- same "re-analysis replaces, doesn't version" convention as upsertAnalysis, since obligations are re-extracted as part of the same analysis pass. */
  replaceObligationsForUpdate(updateId: string, obligations: ComplianceObligation[]): Promise<void>;
  /** A full-object replace, same pattern as updateSource -- Obligation Review's "Edit" action and status transitions both go through this rather than narrower per-field setters, since an edit can touch several fields (description, obligationType, industries, deadlineDescription, deadlineDate) at once. */
  updateObligation(obligation: ComplianceObligation): Promise<void>;
  /** Obligations whose industries include the given one -- the actual "Industries" layer of the knowledge hierarchy, queryable directly rather than requiring a scan of every document. */
  listObligationsByIndustry(industry: string, opts?: { limit?: number }): Promise<ComplianceObligation[]>;
  /** Obligations with a known deadlineDate on or before `beforeDate` -- "what's due soon," the concrete payoff of computing real dates instead of leaving deadlines as prose. */
  listUpcomingObligations(beforeDate: Date, opts?: { limit?: number }): Promise<ComplianceObligation[]>;
  /** A real count, not listObligationsByStatus(status).length -- same "don't undercount a bounded fetch" reasoning as countUpdatesByStatus. What the Operations Dashboard's Pending Reviews reading needs for "8 AI Extractions." */
  countObligationsByStatus(status: ObligationReviewStatus): Promise<number>;
  /** Same status filter as countObligationsByStatus, but the actual records -- what "3 Low Confidence Items" filters down from (confidence is a threshold comparison, not an equality match a count method alone could serve). */
  listObligationsByStatus(status: ObligationReviewStatus, opts?: { limit?: number }): Promise<ComplianceObligation[]>;

  createRule(rule: ComplianceRule): Promise<void>;
  getRuleById(ruleId: string): Promise<ComplianceRule | null>;
  getRuleByKey(key: string): Promise<ComplianceRule | null>;
  listRules(opts?: { limit?: number }): Promise<ComplianceRule[]>;

  /** Sets or clears (null) which rule an update belongs to. Grouping is a deliberate, separate action from ingestion -- see ComplianceUpdate.ruleId's own doc comment. */
  setUpdateRule(updateId: string, ruleId: string | null): Promise<void>;
  /** The Incoming Queue's state transition -- see ComplianceUpdateStatus's own doc comment. */
  setUpdateStatus(updateId: string, status: ComplianceUpdateStatus): Promise<void>;
  /** A rule's full History -- every update linked to it, oldest first (chronological reading order; getCurrentVersion in ruleService.ts derives "current" from the newest end of this same list). */
  listUpdatesForRule(ruleId: string): Promise<ComplianceUpdate[]>;

  addRelatedRule(ruleId: string, relatedRuleId: string): Promise<void>;
  removeRelatedRule(ruleId: string, relatedRuleId: string): Promise<void>;
  listRelatedRuleIds(ruleId: string): Promise<string[]>;

  /** Interpretations are append-only, not replaced -- see RuleInterpretation's own doc comment for why keeping the history of how understanding evolved is the point, unlike ComplianceAnalysis's replace-on-reanalysis convention. */
  createRuleInterpretation(interpretation: RuleInterpretation): Promise<void>;
  /** The most recently synthesized interpretation for this rule, or null if it's never been interpreted. */
  getLatestRuleInterpretation(ruleId: string): Promise<RuleInterpretation | null>;

  createControl(control: ComplianceControl): Promise<void>;
  getControlById(controlId: string): Promise<ComplianceControl | null>;
  getControlByKey(key: string): Promise<ComplianceControl | null>;
  listControls(opts?: { limit?: number }): Promise<ComplianceControl[]>;

  addObligationControlMapping(mapping: ObligationControlMapping): Promise<void>;
  removeObligationControlMapping(obligationId: string, controlId: string): Promise<void>;
  /** Resolved to full ComplianceControl objects -- what an "Affected Controls" view actually needs to render. */
  listControlsForObligation(obligationId: string): Promise<ComplianceControl[]>;
  /** Resolved to full ComplianceObligation objects -- the "CTRL-001 mapped to: [obligation], [obligation]..." view. */
  listObligationsForControl(controlId: string): Promise<ComplianceObligation[]>;

  createPack(pack: CompliancePack): Promise<void>;
  getPackById(packId: string): Promise<CompliancePack | null>;
  getPackByKey(key: string): Promise<CompliancePack | null>;
  listPacks(opts?: { limit?: number }): Promise<CompliancePack[]>;

  addControlToPack(packId: string, controlId: string): Promise<void>;
  removeControlFromPack(packId: string, controlId: string): Promise<void>;
  /** Resolved to full ComplianceControl objects -- what a pack's own detail view needs to render. */
  listControlsForPack(packId: string): Promise<ComplianceControl[]>;
  /** The reverse of listControlsForPack -- which packs require a given control. What the new control-derived impact chain (obligation -> controls -> packs -> products -> orgs) walks outward from a control, one step at a time. */
  listPacksForControl(controlId: string): Promise<CompliancePack[]>;

  createFramework(framework: ComplianceFramework): Promise<void>;
  getFrameworkById(frameworkId: string): Promise<ComplianceFramework | null>;
  getFrameworkByKey(key: string): Promise<ComplianceFramework | null>;
  listFrameworks(opts?: { limit?: number }): Promise<ComplianceFramework[]>;

  addControlToFramework(frameworkId: string, controlId: string): Promise<void>;
  removeControlFromFramework(frameworkId: string, controlId: string): Promise<void>;
  /** Resolved to full ComplianceControl objects -- what a framework's own detail view needs to render. */
  listControlsForFramework(frameworkId: string): Promise<ComplianceControl[]>;
  /** The reverse of listControlsForFramework -- which frameworks require a given control. What a control's own detail view uses to show "this control satisfies: NIST AI RMF, EU AI Act." */
  listFrameworksForControl(controlId: string): Promise<ComplianceFramework[]>;

  createCustomerPolicy(policy: CustomerPolicy): Promise<void>;
  getCustomerPolicyById(policyId: string): Promise<CustomerPolicy | null>;
  listCustomerPoliciesForOrganization(organizationId: string, opts?: { status?: CustomerPolicyStatus }): Promise<CustomerPolicy[]>;
  updateCustomerPolicy(policy: CustomerPolicy): Promise<void>;

  addControlToCustomerPolicy(customerPolicyId: string, controlId: string): Promise<void>;
  removeControlFromCustomerPolicy(customerPolicyId: string, controlId: string): Promise<void>;
  /** Resolved to full ComplianceControl objects -- what a customer policy's own detail view needs to render. */
  listControlsForCustomerPolicy(customerPolicyId: string): Promise<ComplianceControl[]>;
  /** The reverse -- which of an org's customer policies cover a given control. What a control's own detail view can use alongside listFrameworksForControl/listPacksForControl to show the full "what maps to this control" picture. */
  listCustomerPoliciesForControl(controlId: string): Promise<CustomerPolicy[]>;
}
