import type { RiskSignalAggregate } from "../../Threat-Intelligence/src/riskSignals.js";
import type { AssetDependency, BusinessAsset, CloudProviderOutage, DetectorGeneratedInsightType, InsightSearchQuery, InsightType, NetworkRiskInsight, Playbook, RiskAssessment, RiskFactor, RiskKnowledgeCategory, RiskKnowledgeEntry, RiskModel, RiskTreatment, RiskTreatmentStatus, RiskTreatmentType, VendorCategory } from "./types.js";

export interface RiskIntelligenceRepository {
  /** Reads from the same risk_signal_aggregates data Threat-Intelligence owns -- Risk-Intelligence is a read-only consumer of it, not a second writer. */
  listAggregatesInWindow(industry: string, since: Date, until: Date): Promise<RiskSignalAggregate[]>;

  createInsight(insight: NetworkRiskInsight): Promise<void>;
  getInsightById(id: string): Promise<NetworkRiskInsight | null>;
  /** Insight types already generated for this industry within the last N minutes as of `now` -- the dedup check generateNetworkRiskInsights runs before each detector, matching Aegis's own dedup window. Takes `now` explicitly (rather than reading the real clock internally) so it stays consistent with whatever `now` the caller passed to generateNetworkRiskInsights -- otherwise the dedup check and the detectors could disagree about what "now" means. */
  recentInsightTypes(industry: string, sinceMinutes: number, now: Date): Promise<Set<InsightType>>;
  searchInsights(query: InsightSearchQuery): Promise<NetworkRiskInsight[]>;
  resolveInsight(id: string, now: Date): Promise<void>;
  /** The cursor for external-signal ingestion (see externalSignalIngestion.ts) -- mirrors ThreatIntelRepository's own getMostRecentVulnerabilityLastModified, but tracks Risk Intelligence's own "how far have I processed" point, not NVD's. Null when no external_signal insight has ever been created, the ordinary first-run state. */
  getMostRecentExternalSignalInsightCreatedAt(): Promise<Date | null>;
  /**
   * The authoritative dedup guard for external-signal ingestion --
   * checked per source entity, not just via the global cursor above.
   * Needed because at least one real signal source (MITRE campaign
   * sync) unconditionally bumps its own updatedAt on every re-sync,
   * even with no meaningful change -- a cursor alone would re-match
   * and re-generate an insight for the same still-active campaign
   * every single run. sourceReferenceId is the source-specific
   * identifier already carried in contributingFactors (a CVE ID, a
   * MITRE campaign ID, ...).
   */
  hasExternalSignalInsightForSource(source: string, sourceReferenceId: string): Promise<boolean>;

  createRiskFactor(factor: RiskFactor): Promise<void>;
  getRiskFactorById(id: string): Promise<RiskFactor | null>;
  getRiskFactorByKey(key: string): Promise<RiskFactor | null>;
  listRiskFactors(opts?: { limit?: number }): Promise<RiskFactor[]>;

  linkInsightToRiskFactor(insightId: string, riskFactorId: string): Promise<void>;
  unlinkInsightFromRiskFactor(insightId: string, riskFactorId: string): Promise<void>;
  /** Resolved to full RiskFactor objects -- what an insight's own detail view needs to show which dimensions it's classified under. */
  listRiskFactorsForInsight(insightId: string): Promise<RiskFactor[]>;
  /** The reverse -- resolved to full NetworkRiskInsight objects, what a risk factor's own detail view needs. */
  listInsightsForRiskFactor(riskFactorId: string): Promise<NetworkRiskInsight[]>;

  createRiskModel(model: RiskModel): Promise<void>;
  getRiskModelById(id: string): Promise<RiskModel | null>;
  getRiskModelByKey(key: string): Promise<RiskModel | null>;
  listRiskModels(opts?: { limit?: number }): Promise<RiskModel[]>;
  updateRiskModel(model: RiskModel): Promise<void>;
  /** The one row (if any) currently active for a given detector type -- what the orchestrator resolves before calling that detector. Null when nothing's been configured yet, which is a real, ordinary state (see resolveActiveModelParameters's own doc comment), not an error. */
  getActiveRiskModelForDetectorType(detectorType: DetectorGeneratedInsightType): Promise<RiskModel | null>;

  createRiskAssessment(assessment: RiskAssessment): Promise<void>;
  /** Newest first -- the trend view, "how has this industry's exposure changed." */
  listRiskAssessmentsForIndustry(industry: string, opts?: { limit?: number }): Promise<RiskAssessment[]>;
  getLatestRiskAssessmentForIndustry(industry: string): Promise<RiskAssessment | null>;
  /** Every distinct industry that has ever had an insight, resolved or not -- what the snapshot job iterates over. Keeping a resolved industry in this list (rather than only currently-unresolved ones) means its trend history keeps recording zero-exposure snapshots instead of silently vanishing from tracking. */
  listIndustriesWithInsights(): Promise<string[]>;

  createRiskTreatment(treatment: RiskTreatment): Promise<void>;
  getRiskTreatmentById(id: string): Promise<RiskTreatment | null>;
  /** Every treatment proposed for one insight -- an insight can have zero, one, or several; zero is ordinary, not a gap. See types.ts's own doc comment on RiskTreatment. */
  listRiskTreatmentsForInsight(insightId: string): Promise<RiskTreatment[]>;
  updateRiskTreatment(treatment: RiskTreatment): Promise<void>;
  /** General browsing, optionally filtered -- the same role searchInsights plays for insights themselves. */
  listRiskTreatments(opts?: { treatmentType?: RiskTreatmentType; status?: RiskTreatmentStatus; limit?: number }): Promise<RiskTreatment[]>;

  createRiskKnowledgeEntry(entry: RiskKnowledgeEntry): Promise<void>;
  getRiskKnowledgeEntryById(id: string): Promise<RiskKnowledgeEntry | null>;
  getRiskKnowledgeEntryByKey(category: RiskKnowledgeCategory, key: string): Promise<RiskKnowledgeEntry | null>;
  /** All entries in one category, e.g. every known Threat Type -- the browsing view for that category's own catalog page. */
  listRiskKnowledgeEntriesByCategory(category: RiskKnowledgeCategory, opts?: { limit?: number }): Promise<RiskKnowledgeEntry[]>;
  updateRiskKnowledgeEntry(entry: RiskKnowledgeEntry): Promise<void>;

  createBusinessAsset(asset: BusinessAsset): Promise<void>;
  getBusinessAssetById(id: string): Promise<BusinessAsset | null>;
  /** Every asset an org has recorded, active or not -- opts.activeOnly narrows to the currently-active ones, the common case for "what does this org have right now." */
  listBusinessAssetsForOrganization(organizationId: string, opts?: { activeOnly?: boolean }): Promise<BusinessAsset[]>;
  updateBusinessAsset(asset: BusinessAsset): Promise<void>;

  createAssetDependency(dependency: AssetDependency): Promise<void>;
  getAssetDependencyById(id: string): Promise<AssetDependency | null>;
  /** What this specific asset depends on -- its own outgoing edges. */
  listDependenciesForAsset(assetId: string): Promise<AssetDependency[]>;
  /** The reverse -- every dependency (across the org) whose target is this specific asset. What "if this asset goes down, what breaks" needs. */
  listDependentsOfAsset(assetId: string): Promise<AssetDependency[]>;
  /** Every dependency (across the org) whose target is this vendor/category pair -- what a vendor outage cascade query resolves through. */
  listDependentsOfVendor(organizationId: string, vendor: string, category: VendorCategory): Promise<AssetDependency[]>;
  deleteAssetDependency(id: string): Promise<void>;

  createPlaybook(playbook: Playbook): Promise<void>;
  getPlaybookById(id: string): Promise<Playbook | null>;
  getPlaybookByKey(key: string): Promise<Playbook | null>;
  listPlaybooks(opts?: { limit?: number }): Promise<Playbook[]>;
  updatePlaybook(playbook: Playbook): Promise<void>;

  linkPlaybookToRiskFactor(playbookId: string, riskFactorId: string): Promise<void>;
  unlinkPlaybookFromRiskFactor(playbookId: string, riskFactorId: string): Promise<void>;
  /** "Is there a playbook for this kind of risk" -- resolved to full Playbook objects, what a risk factor's own detail view needs. */
  listPlaybooksForRiskFactor(riskFactorId: string): Promise<Playbook[]>;
  /** The reverse -- which risk factors a given playbook applies to. */
  listRiskFactorsForPlaybook(playbookId: string): Promise<RiskFactor[]>;

  createCloudProviderOutage(outage: CloudProviderOutage): Promise<void>;
  getCloudProviderOutageById(id: string): Promise<CloudProviderOutage | null>;
  listCloudProviderOutages(opts?: { vendor?: string; category?: VendorCategory; isResolved?: boolean; limit?: number }): Promise<CloudProviderOutage[]>;
  updateCloudProviderOutage(outage: CloudProviderOutage): Promise<void>;
}
