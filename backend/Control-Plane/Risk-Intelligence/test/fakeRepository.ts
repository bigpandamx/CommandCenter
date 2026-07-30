import type { RiskIntelligenceRepository } from "../src/repository.js";
import type { AssetCriticality, AssetDependency, BusinessAsset, CloudProviderOutage, InsightSearchQuery, InsightType, NetworkRiskInsight, Playbook, RiskAssessment, RiskFactor, RiskKnowledgeCategory, RiskKnowledgeEntry, RiskModel, RiskTreatment, RiskTreatmentStatus, RiskTreatmentType, VendorCategory } from "../src/types.js";
import type { RiskSignalAggregate } from "../../Threat-Intelligence/src/riskSignals.js";

export class FakeRiskIntelligenceRepository implements RiskIntelligenceRepository {
  aggregates: RiskSignalAggregate[] = [];
  insights = new Map<string, NetworkRiskInsight>();
  riskFactors = new Map<string, RiskFactor>();
  insightRiskFactors = new Set<string>(); // keyed by `${insightId}:${riskFactorId}`
  riskModels = new Map<string, RiskModel>();
  riskAssessments = new Map<string, RiskAssessment>();
  riskTreatments = new Map<string, RiskTreatment>();
  riskKnowledgeEntries = new Map<string, RiskKnowledgeEntry>();
  businessAssets = new Map<string, BusinessAsset>();
  assetDependencies = new Map<string, AssetDependency>();
  playbooks = new Map<string, Playbook>();
  playbookRiskFactors = new Set<string>(); // keyed by `${playbookId}:${riskFactorId}`
  cloudProviderOutages = new Map<string, CloudProviderOutage>();

  async listAggregatesInWindow(industry: string, since: Date, until: Date) {
    return this.aggregates.filter(
      (a) =>
        a.industry === industry &&
        a.signalStartTime.getTime() >= since.getTime() &&
        a.signalStartTime.getTime() <= until.getTime(),
    );
  }

  async createInsight(insight: NetworkRiskInsight) {
    this.insights.set(insight.id, insight);
  }

  async getInsightById(id: string) {
    return this.insights.get(id) ?? null;
  }

  async recentInsightTypes(industry: string, sinceMinutes: number, now: Date): Promise<Set<InsightType>> {
    const cutoff = now.getTime() - sinceMinutes * 60 * 1000;
    const types = new Set<InsightType>();
    for (const insight of this.insights.values()) {
      if (insight.industry === industry && insight.createdAt.getTime() >= cutoff) {
        types.add(insight.type);
      }
    }
    return types;
  }

  async searchInsights(query: InsightSearchQuery) {
    let matches = [...this.insights.values()];
    if (query.industry) matches = matches.filter((i) => i.industry === query.industry);
    if (query.type) matches = matches.filter((i) => i.type === query.type);
    if (query.severity) matches = matches.filter((i) => i.severity === query.severity);
    if (query.isResolved !== undefined) matches = matches.filter((i) => i.isResolved === query.isResolved);
    matches = matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return query.limit ? matches.slice(0, query.limit) : matches;
  }

  async resolveInsight(id: string, now: Date) {
    const insight = this.insights.get(id);
    if (insight) {
      this.insights.set(id, { ...insight, isResolved: true, resolvedAt: now });
    }
  }

  async getMostRecentExternalSignalInsightCreatedAt() {
    const externalSignalInsights = [...this.insights.values()].filter((i) => i.type === "external_signal");
    if (externalSignalInsights.length === 0) return null;
    return externalSignalInsights.reduce((latest, i) => (i.createdAt > latest ? i.createdAt : latest), externalSignalInsights[0]!.createdAt);
  }

  async hasExternalSignalInsightForSource(source: string, sourceReferenceId: string) {
    return [...this.insights.values()].some(
      (i) => i.type === "external_signal" && (i.contributingFactors as { source?: string; sourceReferenceId?: string }).source === source && (i.contributingFactors as { source?: string; sourceReferenceId?: string }).sourceReferenceId === sourceReferenceId,
    );
  }

  async createRiskFactor(factor: RiskFactor) {
    this.riskFactors.set(factor.id, factor);
  }
  async getRiskFactorById(id: string) {
    return this.riskFactors.get(id) ?? null;
  }
  async getRiskFactorByKey(key: string) {
    return [...this.riskFactors.values()].find((f) => f.key === key) ?? null;
  }
  async listRiskFactors(opts?: { limit?: number }) {
    const all = [...this.riskFactors.values()].sort((a, b) => a.name.localeCompare(b.name));
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }

  async linkInsightToRiskFactor(insightId: string, riskFactorId: string) {
    this.insightRiskFactors.add(`${insightId}:${riskFactorId}`);
  }
  async unlinkInsightFromRiskFactor(insightId: string, riskFactorId: string) {
    this.insightRiskFactors.delete(`${insightId}:${riskFactorId}`);
  }

  async listRiskFactorsForInsight(insightId: string) {
    const prefix = `${insightId}:`;
    const factorIds = [...this.insightRiskFactors].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
    const factors: RiskFactor[] = [];
    for (const id of factorIds) {
      const f = this.riskFactors.get(id);
      if (f) factors.push(f);
    }
    return factors;
  }

  async listInsightsForRiskFactor(riskFactorId: string) {
    const suffix = `:${riskFactorId}`;
    const insightIds = [...this.insightRiskFactors].filter((k) => k.endsWith(suffix)).map((k) => k.slice(0, -suffix.length));
    const insights: NetworkRiskInsight[] = [];
    for (const id of insightIds) {
      const i = this.insights.get(id);
      if (i) insights.push(i);
    }
    return insights;
  }

  async createRiskModel(model: RiskModel) {
    this.riskModels.set(model.id, model);
  }
  async getRiskModelById(id: string) {
    return this.riskModels.get(id) ?? null;
  }
  async getRiskModelByKey(key: string) {
    return [...this.riskModels.values()].find((m) => m.key === key) ?? null;
  }
  async listRiskModels(opts?: { limit?: number }) {
    const all = [...this.riskModels.values()].sort((a, b) => a.name.localeCompare(b.name));
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }
  async updateRiskModel(model: RiskModel) {
    if (!this.riskModels.has(model.id)) return;
    this.riskModels.set(model.id, model);
  }
  async getActiveRiskModelForDetectorType(detectorType: InsightType) {
    return (
      [...this.riskModels.values()].find((m) => m.isActive && m.parameters.detectorType === detectorType) ?? null
    );
  }

  async createRiskAssessment(assessment: RiskAssessment) {
    this.riskAssessments.set(assessment.id, assessment);
  }

  async listRiskAssessmentsForIndustry(industry: string, opts?: { limit?: number }) {
    const all = [...this.riskAssessments.values()]
      .filter((a) => a.industry === industry)
      .sort((a, b) => b.assessedAt.getTime() - a.assessedAt.getTime());
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }

  async getLatestRiskAssessmentForIndustry(industry: string) {
    const all = await this.listRiskAssessmentsForIndustry(industry, { limit: 1 });
    return all[0] ?? null;
  }

  async listIndustriesWithInsights() {
    return [...new Set([...this.insights.values()].map((i) => i.industry))];
  }

  async createRiskTreatment(treatment: RiskTreatment) {
    this.riskTreatments.set(treatment.id, treatment);
  }
  async getRiskTreatmentById(id: string) {
    return this.riskTreatments.get(id) ?? null;
  }
  async listRiskTreatmentsForInsight(insightId: string) {
    return [...this.riskTreatments.values()]
      .filter((t) => t.insightId === insightId)
      .sort((a, b) => b.proposedAt.getTime() - a.proposedAt.getTime());
  }
  async updateRiskTreatment(treatment: RiskTreatment) {
    if (!this.riskTreatments.has(treatment.id)) return;
    this.riskTreatments.set(treatment.id, treatment);
  }
  async listRiskTreatments(opts?: { treatmentType?: RiskTreatmentType; status?: RiskTreatmentStatus; limit?: number }) {
    let all = [...this.riskTreatments.values()];
    if (opts?.treatmentType) all = all.filter((t) => t.treatmentType === opts.treatmentType);
    if (opts?.status) all = all.filter((t) => t.status === opts.status);
    all = all.sort((a, b) => b.proposedAt.getTime() - a.proposedAt.getTime());
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }

  async createRiskKnowledgeEntry(entry: RiskKnowledgeEntry) {
    this.riskKnowledgeEntries.set(entry.id, entry);
  }
  async getRiskKnowledgeEntryById(id: string) {
    return this.riskKnowledgeEntries.get(id) ?? null;
  }
  async getRiskKnowledgeEntryByKey(category: RiskKnowledgeCategory, key: string) {
    return [...this.riskKnowledgeEntries.values()].find((e) => e.category === category && e.key === key) ?? null;
  }
  async listRiskKnowledgeEntriesByCategory(category: RiskKnowledgeCategory, opts?: { limit?: number }) {
    const all = [...this.riskKnowledgeEntries.values()].filter((e) => e.category === category).sort((a, b) => a.name.localeCompare(b.name));
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }
  async updateRiskKnowledgeEntry(entry: RiskKnowledgeEntry) {
    if (!this.riskKnowledgeEntries.has(entry.id)) return;
    this.riskKnowledgeEntries.set(entry.id, entry);
  }

  async createBusinessAsset(asset: BusinessAsset) {
    this.businessAssets.set(asset.id, asset);
  }
  async getBusinessAssetById(id: string) {
    return this.businessAssets.get(id) ?? null;
  }
  async listBusinessAssetsForOrganization(organizationId: string, opts?: { activeOnly?: boolean }) {
    let all = [...this.businessAssets.values()].filter((a) => a.organizationId === organizationId);
    if (opts?.activeOnly) all = all.filter((a) => a.isActive);
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }
  async updateBusinessAsset(asset: BusinessAsset) {
    if (!this.businessAssets.has(asset.id)) return;
    this.businessAssets.set(asset.id, asset);
  }

  async createAssetDependency(dependency: AssetDependency) {
    this.assetDependencies.set(dependency.id, dependency);
  }
  async getAssetDependencyById(id: string) {
    return this.assetDependencies.get(id) ?? null;
  }
  async listDependenciesForAsset(assetId: string) {
    return [...this.assetDependencies.values()].filter((d) => d.dependentAssetId === assetId);
  }
  async listDependentsOfAsset(assetId: string) {
    return [...this.assetDependencies.values()].filter((d) => d.targetType === "asset" && d.targetAssetId === assetId);
  }
  async listDependentsOfVendor(organizationId: string, vendor: string, category: VendorCategory) {
    return [...this.assetDependencies.values()].filter(
      (d) => d.organizationId === organizationId && d.targetType === "vendor" && d.targetVendor === vendor && d.targetVendorCategory === category,
    );
  }
  async deleteAssetDependency(id: string) {
    this.assetDependencies.delete(id);
  }

  async createPlaybook(playbook: Playbook) {
    this.playbooks.set(playbook.id, playbook);
  }
  async getPlaybookById(id: string) {
    return this.playbooks.get(id) ?? null;
  }
  async getPlaybookByKey(key: string) {
    return [...this.playbooks.values()].find((p) => p.key === key) ?? null;
  }
  async listPlaybooks(opts?: { limit?: number }) {
    const all = [...this.playbooks.values()].sort((a, b) => a.name.localeCompare(b.name));
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }
  async updatePlaybook(playbook: Playbook) {
    if (!this.playbooks.has(playbook.id)) return;
    this.playbooks.set(playbook.id, playbook);
  }

  async linkPlaybookToRiskFactor(playbookId: string, riskFactorId: string) {
    this.playbookRiskFactors.add(`${playbookId}:${riskFactorId}`);
  }
  async unlinkPlaybookFromRiskFactor(playbookId: string, riskFactorId: string) {
    this.playbookRiskFactors.delete(`${playbookId}:${riskFactorId}`);
  }
  async listPlaybooksForRiskFactor(riskFactorId: string) {
    const suffix = `:${riskFactorId}`;
    const playbookIds = [...this.playbookRiskFactors].filter((k) => k.endsWith(suffix)).map((k) => k.slice(0, -suffix.length));
    const playbooks: Playbook[] = [];
    for (const id of playbookIds) {
      const p = this.playbooks.get(id);
      if (p) playbooks.push(p);
    }
    return playbooks;
  }
  async listRiskFactorsForPlaybook(playbookId: string) {
    const prefix = `${playbookId}:`;
    const factorIds = [...this.playbookRiskFactors].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
    const factors: RiskFactor[] = [];
    for (const id of factorIds) {
      const f = this.riskFactors.get(id);
      if (f) factors.push(f);
    }
    return factors;
  }

  async createCloudProviderOutage(outage: CloudProviderOutage) {
    this.cloudProviderOutages.set(outage.id, outage);
  }
  async getCloudProviderOutageById(id: string) {
    return this.cloudProviderOutages.get(id) ?? null;
  }
  async listCloudProviderOutages(opts?: { vendor?: string; category?: VendorCategory; isResolved?: boolean; limit?: number }) {
    let all = [...this.cloudProviderOutages.values()];
    if (opts?.vendor) all = all.filter((o) => o.vendor === opts.vendor);
    if (opts?.category) all = all.filter((o) => o.category === opts.category);
    if (opts?.isResolved !== undefined) all = all.filter((o) => o.isResolved === opts.isResolved);
    all = all.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }
  async updateCloudProviderOutage(outage: CloudProviderOutage) {
    if (!this.cloudProviderOutages.has(outage.id)) return;
    this.cloudProviderOutages.set(outage.id, outage);
  }
}
