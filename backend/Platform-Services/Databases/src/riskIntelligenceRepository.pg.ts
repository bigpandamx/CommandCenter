/**
 * Postgres implementation of Control-Plane/Risk-Intelligence's
 * RiskIntelligenceRepository port. Same offline caveat as every other
 * *.pg.ts file in this folder: type-checked against pg's documented
 * API, not executed against a live database in this session.
 *
 * listAggregatesInWindow reads risk_signal_aggregates directly -- that
 * table is owned by Threat-Intelligence's migration (0013), not this
 * one. Reading it here is read-only access to shared data, the same
 * pattern already established for how the Postgres layer relates to
 * table ownership elsewhere in this codebase (e.g. billing and
 * enrollment tokens sharing the organizations table).
 */
import type { Pool } from "pg";
import type { RiskIntelligenceRepository } from "../../../Control-Plane/Risk-Intelligence/src/repository.js";
import type { AssetDependency, BusinessAsset, CloudProviderOutage, InsightSearchQuery, InsightType, NetworkRiskInsight, Playbook, RiskAssessment, RiskFactor, RiskKnowledgeCategory, RiskKnowledgeEntry, RiskModel, RiskTreatment, RiskTreatmentStatus, RiskTreatmentType, VendorCategory } from "../../../Control-Plane/Risk-Intelligence/src/types.js";
import type { RiskSignalAggregate } from "../../../Control-Plane/Threat-Intelligence/src/riskSignals.js";

export class PgRiskIntelligenceRepository implements RiskIntelligenceRepository {
  constructor(private readonly pool: Pool) {}

  async listAggregatesInWindow(industry: string, since: Date, until: Date): Promise<RiskSignalAggregate[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM risk_signal_aggregates
       WHERE industry = $1 AND signal_start_time >= $2 AND signal_start_time <= $3`,
      [industry, since, until],
    );
    return rows.map(mapAggregate);
  }

  async createInsight(insight: NetworkRiskInsight): Promise<void> {
    await this.pool.query(
      `INSERT INTO network_risk_insights
         (id, industry, type, severity, summary, explanation, contributing_factors, recommendation,
          confidence, linked_aggregate_ids, is_resolved, created_at, resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        insight.id,
        insight.industry,
        insight.type,
        insight.severity,
        insight.summary,
        insight.explanation,
        JSON.stringify(insight.contributingFactors),
        insight.recommendation,
        insight.confidence,
        JSON.stringify(insight.linkedAggregateIds),
        insight.isResolved,
        insight.createdAt,
        insight.resolvedAt,
      ],
    );
  }

  async getInsightById(id: string): Promise<NetworkRiskInsight | null> {
    const { rows } = await this.pool.query(`SELECT * FROM network_risk_insights WHERE id = $1`, [id]);
    return rows[0] ? mapInsight(rows[0]) : null;
  }

  async recentInsightTypes(industry: string, sinceMinutes: number, now: Date): Promise<Set<InsightType>> {
    const cutoff = new Date(now.getTime() - sinceMinutes * 60 * 1000);
    const { rows } = await this.pool.query(
      `SELECT DISTINCT type FROM network_risk_insights WHERE industry = $1 AND created_at >= $2`,
      [industry, cutoff],
    );
    return new Set(rows.map((r) => r.type as InsightType));
  }

  async searchInsights(query: InsightSearchQuery): Promise<NetworkRiskInsight[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.industry) {
      params.push(query.industry);
      conditions.push(`industry = $${params.length}`);
    }
    if (query.type) {
      params.push(query.type);
      conditions.push(`type = $${params.length}`);
    }
    if (query.severity) {
      params.push(query.severity);
      conditions.push(`severity = $${params.length}`);
    }
    if (query.isResolved !== undefined) {
      params.push(query.isResolved);
      conditions.push(`is_resolved = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = query.limit ?? 100;
    params.push(limit);

    const { rows } = await this.pool.query(
      `SELECT * FROM network_risk_insights ${whereClause} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapInsight);
  }

  async resolveInsight(id: string, now: Date): Promise<void> {
    await this.pool.query(
      `UPDATE network_risk_insights SET is_resolved = true, resolved_at = $2 WHERE id = $1`,
      [id, now],
    );
  }

  async getMostRecentExternalSignalInsightCreatedAt(): Promise<Date | null> {
    const { rows } = await this.pool.query(
      `SELECT MAX(created_at) AS most_recent FROM network_risk_insights WHERE type = 'external_signal'`,
    );
    return rows[0]?.most_recent ?? null;
  }

  async hasExternalSignalInsightForSource(source: string, sourceReferenceId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM network_risk_insights
       WHERE type = 'external_signal'
         AND contributing_factors->>'source' = $1
         AND contributing_factors->>'sourceReferenceId' = $2
       LIMIT 1`,
      [source, sourceReferenceId],
    );
    return rows.length > 0;
  }

  async createRiskFactor(factor: RiskFactor): Promise<void> {
    await this.pool.query(
      `INSERT INTO risk_factors (id, key, name, description, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)`,
      [factor.id, factor.key, factor.name, factor.description, factor.createdAt, factor.updatedAt],
    );
  }

  async getRiskFactorById(id: string): Promise<RiskFactor | null> {
    const { rows } = await this.pool.query(`SELECT * FROM risk_factors WHERE id = $1`, [id]);
    return rows[0] ? mapRiskFactor(rows[0]) : null;
  }

  async getRiskFactorByKey(key: string): Promise<RiskFactor | null> {
    const { rows } = await this.pool.query(`SELECT * FROM risk_factors WHERE key = $1`, [key]);
    return rows[0] ? mapRiskFactor(rows[0]) : null;
  }

  async listRiskFactors(opts?: { limit?: number }): Promise<RiskFactor[]> {
    const limit = opts?.limit ?? 200;
    const { rows } = await this.pool.query(`SELECT * FROM risk_factors ORDER BY name ASC LIMIT $1`, [limit]);
    return rows.map(mapRiskFactor);
  }

  async linkInsightToRiskFactor(insightId: string, riskFactorId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO insight_risk_factors (insight_id, risk_factor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [insightId, riskFactorId],
    );
  }

  async unlinkInsightFromRiskFactor(insightId: string, riskFactorId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM insight_risk_factors WHERE insight_id = $1 AND risk_factor_id = $2`,
      [insightId, riskFactorId],
    );
  }

  async listRiskFactorsForInsight(insightId: string): Promise<RiskFactor[]> {
    const { rows } = await this.pool.query(
      `SELECT rf.* FROM risk_factors rf
       JOIN insight_risk_factors irf ON irf.risk_factor_id = rf.id
       WHERE irf.insight_id = $1
       ORDER BY rf.name ASC`,
      [insightId],
    );
    return rows.map(mapRiskFactor);
  }

  async listInsightsForRiskFactor(riskFactorId: string): Promise<NetworkRiskInsight[]> {
    const { rows } = await this.pool.query(
      `SELECT nri.* FROM network_risk_insights nri
       JOIN insight_risk_factors irf ON irf.insight_id = nri.id
       WHERE irf.risk_factor_id = $1
       ORDER BY nri.created_at DESC`,
      [riskFactorId],
    );
    return rows.map(mapInsight);
  }

  async createRiskModel(model: RiskModel): Promise<void> {
    await this.pool.query(
      `INSERT INTO risk_models (id, key, name, description, detector_type, parameters, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        model.id,
        model.key,
        model.name,
        model.description,
        model.parameters.detectorType,
        JSON.stringify(model.parameters),
        model.isActive,
        model.createdAt,
        model.updatedAt,
      ],
    );
  }

  async getRiskModelById(id: string): Promise<RiskModel | null> {
    const { rows } = await this.pool.query(`SELECT * FROM risk_models WHERE id = $1`, [id]);
    return rows[0] ? mapRiskModel(rows[0]) : null;
  }

  async getRiskModelByKey(key: string): Promise<RiskModel | null> {
    const { rows } = await this.pool.query(`SELECT * FROM risk_models WHERE key = $1`, [key]);
    return rows[0] ? mapRiskModel(rows[0]) : null;
  }

  async listRiskModels(opts?: { limit?: number }): Promise<RiskModel[]> {
    const limit = opts?.limit ?? 200;
    const { rows } = await this.pool.query(`SELECT * FROM risk_models ORDER BY name ASC LIMIT $1`, [limit]);
    return rows.map(mapRiskModel);
  }

  async updateRiskModel(model: RiskModel): Promise<void> {
    await this.pool.query(
      `UPDATE risk_models SET name = $2, description = $3, parameters = $4, is_active = $5, updated_at = $6 WHERE id = $1`,
      [model.id, model.name, model.description, JSON.stringify(model.parameters), model.isActive, model.updatedAt],
    );
  }

  async getActiveRiskModelForDetectorType(detectorType: InsightType): Promise<RiskModel | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM risk_models WHERE detector_type = $1 AND is_active = true LIMIT 1`,
      [detectorType],
    );
    return rows[0] ? mapRiskModel(rows[0]) : null;
  }

  async createRiskAssessment(assessment: RiskAssessment): Promise<void> {
    await this.pool.query(
      `INSERT INTO risk_assessments (id, industry, assessed_at, exposure_score, exposure_level, contributing_insight_ids)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [assessment.id, assessment.industry, assessment.assessedAt, assessment.exposureScore, assessment.exposureLevel, assessment.contributingInsightIds],
    );
  }

  async listRiskAssessmentsForIndustry(industry: string, opts?: { limit?: number }): Promise<RiskAssessment[]> {
    const limit = opts?.limit ?? 100;
    const { rows } = await this.pool.query(
      `SELECT * FROM risk_assessments WHERE industry = $1 ORDER BY assessed_at DESC LIMIT $2`,
      [industry, limit],
    );
    return rows.map(mapRiskAssessment);
  }

  async getLatestRiskAssessmentForIndustry(industry: string): Promise<RiskAssessment | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM risk_assessments WHERE industry = $1 ORDER BY assessed_at DESC LIMIT 1`,
      [industry],
    );
    return rows[0] ? mapRiskAssessment(rows[0]) : null;
  }

  async listIndustriesWithInsights(): Promise<string[]> {
    const { rows } = await this.pool.query(`SELECT DISTINCT industry FROM network_risk_insights`);
    return rows.map((r) => r.industry);
  }

  async createRiskTreatment(treatment: RiskTreatment): Promise<void> {
    await this.pool.query(
      `INSERT INTO risk_treatments (id, insight_id, treatment_type, description, status, proposed_by_staff_id, proposed_at, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        treatment.id,
        treatment.insightId,
        treatment.treatmentType,
        treatment.description,
        treatment.status,
        treatment.proposedByStaffId,
        treatment.proposedAt,
        treatment.completedAt,
      ],
    );
  }

  async getRiskTreatmentById(id: string): Promise<RiskTreatment | null> {
    const { rows } = await this.pool.query(`SELECT * FROM risk_treatments WHERE id = $1`, [id]);
    return rows[0] ? mapRiskTreatment(rows[0]) : null;
  }

  async listRiskTreatmentsForInsight(insightId: string): Promise<RiskTreatment[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM risk_treatments WHERE insight_id = $1 ORDER BY proposed_at DESC`,
      [insightId],
    );
    return rows.map(mapRiskTreatment);
  }

  async updateRiskTreatment(treatment: RiskTreatment): Promise<void> {
    await this.pool.query(
      `UPDATE risk_treatments SET status = $2, completed_at = $3 WHERE id = $1`,
      [treatment.id, treatment.status, treatment.completedAt],
    );
  }

  async listRiskTreatments(opts?: { treatmentType?: RiskTreatmentType; status?: RiskTreatmentStatus; limit?: number }): Promise<RiskTreatment[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (opts?.treatmentType) {
      params.push(opts.treatmentType);
      conditions.push(`treatment_type = $${params.length}`);
    }
    if (opts?.status) {
      params.push(opts.status);
      conditions.push(`status = $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(opts?.limit ?? 100);
    const { rows } = await this.pool.query(
      `SELECT * FROM risk_treatments ${whereClause} ORDER BY proposed_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapRiskTreatment);
  }

  async createRiskKnowledgeEntry(entry: RiskKnowledgeEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO risk_knowledge_entries (id, category, key, name, description, treatment_type, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [entry.id, entry.category, entry.key, entry.name, entry.description, entry.treatmentType, entry.createdAt, entry.updatedAt],
    );
  }

  async getRiskKnowledgeEntryById(id: string): Promise<RiskKnowledgeEntry | null> {
    const { rows } = await this.pool.query(`SELECT * FROM risk_knowledge_entries WHERE id = $1`, [id]);
    return rows[0] ? mapRiskKnowledgeEntry(rows[0]) : null;
  }

  async getRiskKnowledgeEntryByKey(category: RiskKnowledgeCategory, key: string): Promise<RiskKnowledgeEntry | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM risk_knowledge_entries WHERE category = $1 AND key = $2`,
      [category, key],
    );
    return rows[0] ? mapRiskKnowledgeEntry(rows[0]) : null;
  }

  async listRiskKnowledgeEntriesByCategory(category: RiskKnowledgeCategory, opts?: { limit?: number }): Promise<RiskKnowledgeEntry[]> {
    const limit = opts?.limit ?? 200;
    const { rows } = await this.pool.query(
      `SELECT * FROM risk_knowledge_entries WHERE category = $1 ORDER BY name ASC LIMIT $2`,
      [category, limit],
    );
    return rows.map(mapRiskKnowledgeEntry);
  }

  async updateRiskKnowledgeEntry(entry: RiskKnowledgeEntry): Promise<void> {
    await this.pool.query(
      `UPDATE risk_knowledge_entries SET name = $2, description = $3, updated_at = $4 WHERE id = $1`,
      [entry.id, entry.name, entry.description, entry.updatedAt],
    );
  }

  async createBusinessAsset(asset: BusinessAsset): Promise<void> {
    await this.pool.query(
      `INSERT INTO business_assets (id, organization_id, name, description, category, criticality, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [asset.id, asset.organizationId, asset.name, asset.description, asset.category, asset.criticality, asset.isActive, asset.createdAt, asset.updatedAt],
    );
  }

  async getBusinessAssetById(id: string): Promise<BusinessAsset | null> {
    const { rows } = await this.pool.query(`SELECT * FROM business_assets WHERE id = $1`, [id]);
    return rows[0] ? mapBusinessAsset(rows[0]) : null;
  }

  async listBusinessAssetsForOrganization(organizationId: string, opts?: { activeOnly?: boolean }): Promise<BusinessAsset[]> {
    const query = opts?.activeOnly
      ? `SELECT * FROM business_assets WHERE organization_id = $1 AND is_active = true ORDER BY name ASC`
      : `SELECT * FROM business_assets WHERE organization_id = $1 ORDER BY name ASC`;
    const { rows } = await this.pool.query(query, [organizationId]);
    return rows.map(mapBusinessAsset);
  }

  async updateBusinessAsset(asset: BusinessAsset): Promise<void> {
    await this.pool.query(
      `UPDATE business_assets SET name = $2, description = $3, category = $4, criticality = $5, is_active = $6, updated_at = $7 WHERE id = $1`,
      [asset.id, asset.name, asset.description, asset.category, asset.criticality, asset.isActive, asset.updatedAt],
    );
  }

  async createAssetDependency(dependency: AssetDependency): Promise<void> {
    await this.pool.query(
      `INSERT INTO asset_dependencies
         (id, organization_id, dependent_asset_id, target_type, target_asset_id, target_vendor, target_vendor_category, description, criticality, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        dependency.id,
        dependency.organizationId,
        dependency.dependentAssetId,
        dependency.targetType,
        dependency.targetAssetId,
        dependency.targetVendor,
        dependency.targetVendorCategory,
        dependency.description,
        dependency.criticality,
        dependency.createdAt,
        dependency.updatedAt,
      ],
    );
  }

  async getAssetDependencyById(id: string): Promise<AssetDependency | null> {
    const { rows } = await this.pool.query(`SELECT * FROM asset_dependencies WHERE id = $1`, [id]);
    return rows[0] ? mapAssetDependency(rows[0]) : null;
  }

  async listDependenciesForAsset(assetId: string): Promise<AssetDependency[]> {
    const { rows } = await this.pool.query(`SELECT * FROM asset_dependencies WHERE dependent_asset_id = $1`, [assetId]);
    return rows.map(mapAssetDependency);
  }

  async listDependentsOfAsset(assetId: string): Promise<AssetDependency[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM asset_dependencies WHERE target_type = 'asset' AND target_asset_id = $1`,
      [assetId],
    );
    return rows.map(mapAssetDependency);
  }

  async listDependentsOfVendor(organizationId: string, vendor: string, category: VendorCategory): Promise<AssetDependency[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM asset_dependencies
       WHERE organization_id = $1 AND target_type = 'vendor' AND target_vendor = $2 AND target_vendor_category = $3`,
      [organizationId, vendor, category],
    );
    return rows.map(mapAssetDependency);
  }

  async deleteAssetDependency(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM asset_dependencies WHERE id = $1`, [id]);
  }

  async createPlaybook(playbook: Playbook): Promise<void> {
    await this.pool.query(
      `INSERT INTO playbooks (id, key, name, description, steps, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [playbook.id, playbook.key, playbook.name, playbook.description, JSON.stringify(playbook.steps), playbook.createdAt, playbook.updatedAt],
    );
  }

  async getPlaybookById(id: string): Promise<Playbook | null> {
    const { rows } = await this.pool.query(`SELECT * FROM playbooks WHERE id = $1`, [id]);
    return rows[0] ? mapPlaybook(rows[0]) : null;
  }

  async getPlaybookByKey(key: string): Promise<Playbook | null> {
    const { rows } = await this.pool.query(`SELECT * FROM playbooks WHERE key = $1`, [key]);
    return rows[0] ? mapPlaybook(rows[0]) : null;
  }

  async listPlaybooks(opts?: { limit?: number }): Promise<Playbook[]> {
    const limit = opts?.limit ?? 200;
    const { rows } = await this.pool.query(`SELECT * FROM playbooks ORDER BY name ASC LIMIT $1`, [limit]);
    return rows.map(mapPlaybook);
  }

  async updatePlaybook(playbook: Playbook): Promise<void> {
    await this.pool.query(
      `UPDATE playbooks SET name = $2, description = $3, steps = $4, updated_at = $5 WHERE id = $1`,
      [playbook.id, playbook.name, playbook.description, JSON.stringify(playbook.steps), playbook.updatedAt],
    );
  }

  async linkPlaybookToRiskFactor(playbookId: string, riskFactorId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO playbook_risk_factors (playbook_id, risk_factor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [playbookId, riskFactorId],
    );
  }

  async unlinkPlaybookFromRiskFactor(playbookId: string, riskFactorId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM playbook_risk_factors WHERE playbook_id = $1 AND risk_factor_id = $2`,
      [playbookId, riskFactorId],
    );
  }

  async listPlaybooksForRiskFactor(riskFactorId: string): Promise<Playbook[]> {
    const { rows } = await this.pool.query(
      `SELECT p.* FROM playbooks p
       JOIN playbook_risk_factors prf ON prf.playbook_id = p.id
       WHERE prf.risk_factor_id = $1
       ORDER BY p.name ASC`,
      [riskFactorId],
    );
    return rows.map(mapPlaybook);
  }

  async listRiskFactorsForPlaybook(playbookId: string): Promise<RiskFactor[]> {
    const { rows } = await this.pool.query(
      `SELECT rf.* FROM risk_factors rf
       JOIN playbook_risk_factors prf ON prf.risk_factor_id = rf.id
       WHERE prf.playbook_id = $1
       ORDER BY rf.name ASC`,
      [playbookId],
    );
    return rows.map(mapRiskFactor);
  }

  async createCloudProviderOutage(outage: CloudProviderOutage): Promise<void> {
    await this.pool.query(
      `INSERT INTO cloud_provider_outages
         (id, vendor, category, title, description, severity, affected_services, started_at, is_resolved, resolved_at, source_url, reported_by_staff_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        outage.id,
        outage.vendor,
        outage.category,
        outage.title,
        outage.description,
        outage.severity,
        JSON.stringify(outage.affectedServices),
        outage.startedAt,
        outage.isResolved,
        outage.resolvedAt,
        outage.sourceUrl,
        outage.reportedByStaffId,
        outage.createdAt,
        outage.updatedAt,
      ],
    );
  }

  async getCloudProviderOutageById(id: string): Promise<CloudProviderOutage | null> {
    const { rows } = await this.pool.query(`SELECT * FROM cloud_provider_outages WHERE id = $1`, [id]);
    return rows[0] ? mapCloudProviderOutage(rows[0]) : null;
  }

  async listCloudProviderOutages(opts?: { vendor?: string; category?: VendorCategory; isResolved?: boolean; limit?: number }): Promise<CloudProviderOutage[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (opts?.vendor) {
      params.push(opts.vendor);
      conditions.push(`vendor = $${params.length}`);
    }
    if (opts?.category) {
      params.push(opts.category);
      conditions.push(`category = $${params.length}`);
    }
    if (opts?.isResolved !== undefined) {
      params.push(opts.isResolved);
      conditions.push(`is_resolved = $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(opts?.limit ?? 100);
    const { rows } = await this.pool.query(
      `SELECT * FROM cloud_provider_outages ${whereClause} ORDER BY started_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapCloudProviderOutage);
  }

  async updateCloudProviderOutage(outage: CloudProviderOutage): Promise<void> {
    await this.pool.query(
      `UPDATE cloud_provider_outages SET
         title = $2, description = $3, severity = $4, affected_services = $5,
         is_resolved = $6, resolved_at = $7, source_url = $8, updated_at = $9
       WHERE id = $1`,
      [
        outage.id,
        outage.title,
        outage.description,
        outage.severity,
        JSON.stringify(outage.affectedServices),
        outage.isResolved,
        outage.resolvedAt,
        outage.sourceUrl,
        outage.updatedAt,
      ],
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAggregate(row: any): RiskSignalAggregate {
  return {
    id: row.id,
    organizationHash: row.organization_hash,
    signalType: row.signal_type,
    industry: row.industry,
    signalCount: row.signal_count,
    totalDeploymentsCount: row.total_deployments_count,
    avgSeverityScore: row.avg_severity_score,
    maxSeverityScore: row.max_severity_score,
    noiseEpsilon: row.noise_epsilon,
    aggregationWindowHours: row.aggregation_window_hours,
    signalStartTime: row.signal_start_time,
    signalEndTime: row.signal_end_time,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapInsight(row: any): NetworkRiskInsight {
  return {
    id: row.id,
    industry: row.industry,
    type: row.type,
    severity: row.severity,
    summary: row.summary,
    explanation: row.explanation,
    contributingFactors: row.contributing_factors,
    recommendation: row.recommendation,
    confidence: row.confidence,
    linkedAggregateIds: row.linked_aggregate_ids,
    isResolved: row.is_resolved,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRiskFactor(row: any): RiskFactor {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRiskModel(row: any): RiskModel {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    parameters: row.parameters,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRiskAssessment(row: any): RiskAssessment {
  return {
    id: row.id,
    industry: row.industry,
    assessedAt: row.assessed_at,
    exposureScore: Number(row.exposure_score),
    exposureLevel: row.exposure_level,
    contributingInsightIds: row.contributing_insight_ids,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRiskTreatment(row: any): RiskTreatment {
  return {
    id: row.id,
    insightId: row.insight_id,
    treatmentType: row.treatment_type,
    description: row.description,
    status: row.status,
    proposedByStaffId: row.proposed_by_staff_id,
    proposedAt: row.proposed_at,
    completedAt: row.completed_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRiskKnowledgeEntry(row: any): RiskKnowledgeEntry {
  return {
    id: row.id,
    category: row.category,
    key: row.key,
    name: row.name,
    description: row.description,
    treatmentType: row.treatment_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBusinessAsset(row: any): BusinessAsset {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    category: row.category,
    criticality: row.criticality,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAssetDependency(row: any): AssetDependency {
  return {
    id: row.id,
    organizationId: row.organization_id,
    dependentAssetId: row.dependent_asset_id,
    targetType: row.target_type,
    targetAssetId: row.target_asset_id,
    targetVendor: row.target_vendor,
    targetVendorCategory: row.target_vendor_category,
    description: row.description,
    criticality: row.criticality,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPlaybook(row: any): Playbook {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    steps: row.steps,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCloudProviderOutage(row: any): CloudProviderOutage {
  return {
    id: row.id,
    vendor: row.vendor,
    category: row.category,
    title: row.title,
    description: row.description,
    severity: row.severity,
    affectedServices: row.affected_services,
    startedAt: row.started_at,
    isResolved: row.is_resolved,
    resolvedAt: row.resolved_at,
    sourceUrl: row.source_url,
    reportedByStaffId: row.reported_by_staff_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
