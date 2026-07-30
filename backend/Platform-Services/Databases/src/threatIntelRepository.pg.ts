/**
 * Postgres implementation of Control-Plane/Threat-Intelligence's
 * ThreatIntelRepository port. Same offline caveat as every other
 * *.pg.ts file in this folder: type-checked against pg's documented
 * API, not executed against a live database in this session.
 */
import type { Pool } from "pg";
import type { ThreatIntelRepository } from "../../../Control-Plane/Threat-Intelligence/src/repository.js";
import type {
  Campaign,
  CampaignSearchQuery,
  IntelligenceReport,
  IntelligenceReportSearchQuery,
  Ioc,
  IocSearchQuery,
  Malware,
  MalwareSearchQuery,
  PromptAbuseSignature,
  SignatureSearchQuery,
  Technique,
  TechniqueSearchQuery,
  ThreatActor,
  ThreatActorSearchQuery,
  ThreatPattern,
  ThreatPatternSearchQuery,
  Vulnerability,
  VulnerabilitySearchQuery,
} from "../../../Control-Plane/Threat-Intelligence/src/types.js";
import type { OrganizationConsent } from "../../../Control-Plane/Threat-Intelligence/src/consent.js";
import type { DataSharingLogEntry, ThreatPatternObservation } from "../../../Control-Plane/Threat-Intelligence/src/observations.js";
import type { DeletionRequest } from "../../../Control-Plane/Threat-Intelligence/src/deletionRequests.js";
import type { RiskSignalAggregate } from "../../../Control-Plane/Threat-Intelligence/src/riskSignals.js";
import type { IndustryBenchmark, BenchmarkMetric } from "../../../Control-Plane/Threat-Intelligence/src/benchmarks.js";
import type { SignatureDetectionEvent } from "../../../Control-Plane/Threat-Intelligence/src/signatureDetections.js";

export class PgThreatIntelRepository implements ThreatIntelRepository {
  constructor(private readonly pool: Pool) {}

  async createPattern(pattern: ThreatPattern): Promise<void> {
    await this.pool.query(
      `INSERT INTO threat_patterns
         (id, pattern_id, pattern_name, threat_type, severity, description, attack_vector,
          indicators_of_compromise, detection_signature, confidence_threshold, first_observed,
          last_observed, total_observations, affected_organizations_count, affected_industries,
          avg_severity_score, success_rate, estimated_prevalence, mitigation_steps,
          remediation_guidance, is_active, is_false_positive, verified_by_analyst,
          external_references, related_pattern_ids, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
      [
        pattern.id,
        pattern.patternId,
        pattern.patternName,
        pattern.threatType,
        pattern.severity,
        pattern.description,
        pattern.attackVector,
        pattern.indicatorsOfCompromise ? JSON.stringify(pattern.indicatorsOfCompromise) : null,
        JSON.stringify(pattern.detectionSignature),
        pattern.confidenceThreshold,
        pattern.firstObserved,
        pattern.lastObserved,
        pattern.totalObservations,
        pattern.affectedOrganizationsCount,
        pattern.affectedIndustries ? JSON.stringify(pattern.affectedIndustries) : null,
        pattern.avgSeverityScore,
        pattern.successRate,
        pattern.estimatedPrevalence,
        pattern.mitigationSteps ? JSON.stringify(pattern.mitigationSteps) : null,
        pattern.remediationGuidance,
        pattern.isActive,
        pattern.isFalsePositive,
        pattern.verifiedByAnalyst,
        pattern.externalReferences ? JSON.stringify(pattern.externalReferences) : null,
        pattern.relatedPatternIds ? JSON.stringify(pattern.relatedPatternIds) : null,
        pattern.createdAt,
        pattern.updatedAt,
      ],
    );
  }

  async getPatternById(id: string): Promise<ThreatPattern | null> {
    const { rows } = await this.pool.query(`SELECT * FROM threat_patterns WHERE id = $1`, [id]);
    return rows[0] ? mapPattern(rows[0]) : null;
  }

  async getPatternByPatternId(patternId: string): Promise<ThreatPattern | null> {
    const { rows } = await this.pool.query(`SELECT * FROM threat_patterns WHERE pattern_id = $1`, [patternId]);
    return rows[0] ? mapPattern(rows[0]) : null;
  }

  async updatePattern(pattern: ThreatPattern): Promise<void> {
    await this.pool.query(
      `UPDATE threat_patterns SET
         pattern_name = $2, threat_type = $3, severity = $4, description = $5, attack_vector = $6,
         indicators_of_compromise = $7, detection_signature = $8, confidence_threshold = $9,
         last_observed = $10, total_observations = $11, affected_organizations_count = $12,
         affected_industries = $13, avg_severity_score = $14, success_rate = $15,
         estimated_prevalence = $16, mitigation_steps = $17, remediation_guidance = $18,
         is_active = $19, is_false_positive = $20, verified_by_analyst = $21,
         external_references = $22, related_pattern_ids = $23, updated_at = $24
       WHERE id = $1`,
      [
        pattern.id,
        pattern.patternName,
        pattern.threatType,
        pattern.severity,
        pattern.description,
        pattern.attackVector,
        pattern.indicatorsOfCompromise ? JSON.stringify(pattern.indicatorsOfCompromise) : null,
        JSON.stringify(pattern.detectionSignature),
        pattern.confidenceThreshold,
        pattern.lastObserved,
        pattern.totalObservations,
        pattern.affectedOrganizationsCount,
        pattern.affectedIndustries ? JSON.stringify(pattern.affectedIndustries) : null,
        pattern.avgSeverityScore,
        pattern.successRate,
        pattern.estimatedPrevalence,
        pattern.mitigationSteps ? JSON.stringify(pattern.mitigationSteps) : null,
        pattern.remediationGuidance,
        pattern.isActive,
        pattern.isFalsePositive,
        pattern.verifiedByAnalyst,
        pattern.externalReferences ? JSON.stringify(pattern.externalReferences) : null,
        pattern.relatedPatternIds ? JSON.stringify(pattern.relatedPatternIds) : null,
        pattern.updatedAt,
      ],
    );
  }

  async searchPatterns(query: ThreatPatternSearchQuery): Promise<ThreatPattern[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.severity) {
      params.push(query.severity);
      conditions.push(`severity = $${params.length}`);
    }
    if (query.threatType) {
      params.push(query.threatType);
      conditions.push(`threat_type = $${params.length}`);
    }
    if (query.isActive !== undefined) {
      params.push(query.isActive);
      conditions.push(`is_active = $${params.length}`);
    }
    if (query.updatedSince) {
      params.push(query.updatedSince);
      conditions.push(`updated_at >= $${params.length}`);
    }
    if (query.text) {
      params.push(`%${query.text}%`);
      const p = params.length;
      conditions.push(`(pattern_name ILIKE $${p} OR description ILIKE $${p})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await this.pool.query(
      `SELECT * FROM threat_patterns ${whereClause} ORDER BY updated_at DESC`,
      params,
    );
    return rows.map(mapPattern);
  }

  async createSignature(signature: PromptAbuseSignature): Promise<void> {
    await this.pool.query(
      `INSERT INTO prompt_abuse_signatures
         (id, signature_id, signature_name, category, pattern_regex, pattern_keywords,
          detection_logic, match_threshold, discovered_from_org_count, total_detections,
          false_positive_rate, severity, risk_score, example_prompts, is_active, is_experimental,
          related_threat_pattern_id, created_at, updated_at, last_detection)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        signature.id,
        signature.signatureId,
        signature.signatureName,
        signature.category,
        signature.patternRegex,
        signature.patternKeywords ? JSON.stringify(signature.patternKeywords) : null,
        JSON.stringify(signature.detectionLogic),
        signature.matchThreshold,
        signature.discoveredFromOrgCount,
        signature.totalDetections,
        signature.falsePositiveRate,
        signature.severity,
        signature.riskScore,
        signature.examplePrompts ? JSON.stringify(signature.examplePrompts) : null,
        signature.isActive,
        signature.isExperimental,
        signature.relatedThreatPatternId,
        signature.createdAt,
        signature.updatedAt,
        signature.lastDetection,
      ],
    );
  }

  async getSignatureById(id: string): Promise<PromptAbuseSignature | null> {
    const { rows } = await this.pool.query(`SELECT * FROM prompt_abuse_signatures WHERE id = $1`, [id]);
    return rows[0] ? mapSignature(rows[0]) : null;
  }

  async getSignatureBySignatureId(signatureId: string): Promise<PromptAbuseSignature | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM prompt_abuse_signatures WHERE signature_id = $1`,
      [signatureId],
    );
    return rows[0] ? mapSignature(rows[0]) : null;
  }

  async updateSignature(signature: PromptAbuseSignature): Promise<void> {
    await this.pool.query(
      `UPDATE prompt_abuse_signatures SET
         signature_name = $2, category = $3, pattern_regex = $4, pattern_keywords = $5,
         detection_logic = $6, match_threshold = $7, discovered_from_org_count = $8,
         total_detections = $9, false_positive_rate = $10, severity = $11, risk_score = $12,
         example_prompts = $13, is_active = $14, is_experimental = $15,
         related_threat_pattern_id = $16, updated_at = $17, last_detection = $18
       WHERE id = $1`,
      [
        signature.id,
        signature.signatureName,
        signature.category,
        signature.patternRegex,
        signature.patternKeywords ? JSON.stringify(signature.patternKeywords) : null,
        JSON.stringify(signature.detectionLogic),
        signature.matchThreshold,
        signature.discoveredFromOrgCount,
        signature.totalDetections,
        signature.falsePositiveRate,
        signature.severity,
        signature.riskScore,
        signature.examplePrompts ? JSON.stringify(signature.examplePrompts) : null,
        signature.isActive,
        signature.isExperimental,
        signature.relatedThreatPatternId,
        signature.updatedAt,
        signature.lastDetection,
      ],
    );
  }

  async searchSignatures(query: SignatureSearchQuery): Promise<PromptAbuseSignature[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.category) {
      params.push(query.category);
      conditions.push(`category = $${params.length}`);
    }
    if (query.severity) {
      params.push(query.severity);
      conditions.push(`severity = $${params.length}`);
    }
    if (query.isActive !== undefined) {
      params.push(query.isActive);
      conditions.push(`is_active = $${params.length}`);
    }
    if (query.updatedSince) {
      params.push(query.updatedSince);
      conditions.push(`updated_at >= $${params.length}`);
    }
    if (query.text) {
      params.push(`%${query.text}%`);
      conditions.push(`signature_name ILIKE $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await this.pool.query(
      `SELECT * FROM prompt_abuse_signatures ${whereClause} ORDER BY updated_at DESC`,
      params,
    );
    return rows.map(mapSignature);
  }

  async getConsent(organizationId: string): Promise<OrganizationConsent | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM organization_consents WHERE organization_id = $1`,
      [organizationId],
    );
    return rows[0] ? mapConsent(rows[0]) : null;
  }

  async upsertConsent(consent: OrganizationConsent): Promise<void> {
    await this.pool.query(
      `INSERT INTO organization_consents
         (organization_id, share_risk_signals, share_threat_patterns, share_benchmark_data,
          anonymization_level, data_retention_days, consent_version, created_at, updated_at, revoked_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (organization_id) DO UPDATE SET
         share_risk_signals = EXCLUDED.share_risk_signals,
         share_threat_patterns = EXCLUDED.share_threat_patterns,
         share_benchmark_data = EXCLUDED.share_benchmark_data,
         anonymization_level = EXCLUDED.anonymization_level,
         data_retention_days = EXCLUDED.data_retention_days,
         consent_version = EXCLUDED.consent_version,
         updated_at = EXCLUDED.updated_at,
         revoked_at = EXCLUDED.revoked_at`,
      [
        consent.organizationId,
        consent.shareRiskSignals,
        consent.shareThreatPatterns,
        consent.shareBenchmarkData,
        consent.anonymizationLevel,
        consent.dataRetentionDays,
        consent.consentVersion,
        consent.createdAt,
        consent.updatedAt,
        consent.revokedAt,
      ],
    );
  }

  async appendObservation(observation: ThreatPatternObservation): Promise<void> {
    await this.pool.query(
      `INSERT INTO threat_pattern_observations
         (id, threat_pattern_id, organization_hash, industry, severity_score, occurred_at, received_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        observation.id,
        observation.threatPatternId,
        observation.organizationHash,
        observation.industry,
        observation.severityScore,
        observation.occurredAt,
        observation.receivedAt,
      ],
    );
  }

  async countObservationsForPattern(threatPatternId: string): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM threat_pattern_observations WHERE threat_pattern_id = $1`,
      [threatPatternId],
    );
    return rows[0]?.count ?? 0;
  }

  async countDistinctOrgsForPattern(threatPatternId: string): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(DISTINCT organization_hash)::int AS count FROM threat_pattern_observations WHERE threat_pattern_id = $1`,
      [threatPatternId],
    );
    return rows[0]?.count ?? 0;
  }

  async recordDataSharingLog(entry: DataSharingLogEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO network_data_sharing_logs
         (id, organization_id, organization_hash, data_type, record_count, anonymization_applied,
          differential_privacy_applied, consent_version, sharing_purpose, retention_until, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        entry.id,
        entry.organizationId,
        entry.organizationHash,
        entry.dataType,
        entry.recordCount,
        entry.anonymizationApplied,
        entry.differentialPrivacyApplied,
        entry.consentVersion,
        entry.sharingPurpose,
        entry.retentionUntil,
        entry.createdAt,
      ],
    );
  }

  async createDeletionRequest(request: DeletionRequest): Promise<void> {
    await this.pool.query(
      `INSERT INTO threat_intel_deletion_requests
         (id, organization_id, reason, delete_all, data_types, status, estimated_records,
          actual_records_deleted, requested_at, processed_at, processed_by_staff_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        request.id,
        request.organizationId,
        request.reason,
        request.deleteAll,
        JSON.stringify(request.dataTypes),
        request.status,
        request.estimatedRecords,
        request.actualRecordsDeleted,
        request.requestedAt,
        request.processedAt,
        request.processedByStaffId,
      ],
    );
  }

  async getDeletionRequestById(id: string): Promise<DeletionRequest | null> {
    const { rows } = await this.pool.query(`SELECT * FROM threat_intel_deletion_requests WHERE id = $1`, [id]);
    return rows[0] ? mapDeletionRequest(rows[0]) : null;
  }

  async listDeletionRequestsForOrg(organizationId: string): Promise<DeletionRequest[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM threat_intel_deletion_requests WHERE organization_id = $1 ORDER BY requested_at DESC`,
      [organizationId],
    );
    return rows.map(mapDeletionRequest);
  }

  async updateDeletionRequest(request: DeletionRequest): Promise<void> {
    await this.pool.query(
      `UPDATE threat_intel_deletion_requests SET
         status = $2, actual_records_deleted = $3, processed_at = $4, processed_by_staff_id = $5
       WHERE id = $1`,
      [
        request.id,
        request.status,
        request.actualRecordsDeleted,
        request.processedAt,
        request.processedByStaffId,
      ],
    );
  }

  async countObservationsForOrgHash(organizationHash: string): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM threat_pattern_observations WHERE organization_hash = $1`,
      [organizationHash],
    );
    return rows[0]?.count ?? 0;
  }

  async countSharingLogsForOrg(organizationId: string): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM network_data_sharing_logs WHERE organization_id = $1`,
      [organizationId],
    );
    return rows[0]?.count ?? 0;
  }

  async deleteObservationsForOrgHash(organizationHash: string): Promise<number> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM threat_pattern_observations WHERE organization_hash = $1`,
      [organizationHash],
    );
    return rowCount ?? 0;
  }

  async deleteSharingLogsForOrg(organizationId: string): Promise<number> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM network_data_sharing_logs WHERE organization_id = $1`,
      [organizationId],
    );
    return rowCount ?? 0;
  }

  async createRiskSignalAggregate(aggregate: RiskSignalAggregate): Promise<void> {
    await this.pool.query(
      `INSERT INTO risk_signal_aggregates
         (id, organization_hash, signal_type, industry, signal_count, total_deployments_count,
          avg_severity_score, max_severity_score, noise_epsilon, aggregation_window_hours,
          signal_start_time, signal_end_time, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        aggregate.id,
        aggregate.organizationHash,
        aggregate.signalType,
        aggregate.industry,
        aggregate.signalCount,
        aggregate.totalDeploymentsCount,
        aggregate.avgSeverityScore,
        aggregate.maxSeverityScore,
        aggregate.noiseEpsilon,
        aggregate.aggregationWindowHours,
        aggregate.signalStartTime,
        aggregate.signalEndTime,
        aggregate.createdAt,
      ],
    );
  }

  async listRiskSignalAggregates(industry: string, since: Date): Promise<RiskSignalAggregate[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM risk_signal_aggregates WHERE industry = $1 AND signal_start_time >= $2`,
      [industry, since],
    );
    return rows.map(mapRiskSignalAggregate);
  }

  async upsertIndustryBenchmark(benchmark: IndustryBenchmark): Promise<void> {
    await this.pool.query(
      `INSERT INTO industry_benchmarks
         (id, industry, metric, benchmark_period, percentile_10, percentile_25, percentile_50,
          percentile_75, percentile_90, mean_value, std_deviation, sample_size, total_data_points,
          min_value, max_value, confidence_score, data_quality_score, calculated_at, valid_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (industry, metric, benchmark_period) DO UPDATE SET
         percentile_10 = EXCLUDED.percentile_10,
         percentile_25 = EXCLUDED.percentile_25,
         percentile_50 = EXCLUDED.percentile_50,
         percentile_75 = EXCLUDED.percentile_75,
         percentile_90 = EXCLUDED.percentile_90,
         mean_value = EXCLUDED.mean_value,
         std_deviation = EXCLUDED.std_deviation,
         sample_size = EXCLUDED.sample_size,
         total_data_points = EXCLUDED.total_data_points,
         min_value = EXCLUDED.min_value,
         max_value = EXCLUDED.max_value,
         confidence_score = EXCLUDED.confidence_score,
         data_quality_score = EXCLUDED.data_quality_score,
         calculated_at = EXCLUDED.calculated_at,
         valid_until = EXCLUDED.valid_until`,
      [
        benchmark.id,
        benchmark.industry,
        benchmark.metric,
        benchmark.benchmarkPeriod,
        benchmark.percentile10,
        benchmark.percentile25,
        benchmark.percentile50,
        benchmark.percentile75,
        benchmark.percentile90,
        benchmark.meanValue,
        benchmark.stdDeviation,
        benchmark.sampleSize,
        benchmark.totalDataPoints,
        benchmark.minValue,
        benchmark.maxValue,
        benchmark.confidenceScore,
        benchmark.dataQualityScore,
        benchmark.calculatedAt,
        benchmark.validUntil,
      ],
    );
  }

  async getIndustryBenchmark(
    industry: string,
    metric: BenchmarkMetric,
    benchmarkPeriod: string,
  ): Promise<IndustryBenchmark | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM industry_benchmarks WHERE industry = $1 AND metric = $2 AND benchmark_period = $3`,
      [industry, metric, benchmarkPeriod],
    );
    return rows[0] ? mapIndustryBenchmark(rows[0]) : null;
  }

  async listBenchmarks(industry: string | undefined, limit: number, now: Date): Promise<IndustryBenchmark[]> {
    const params: unknown[] = [now];
    const conditions = [`valid_until > $1`];
    if (industry) {
      params.push(industry);
      conditions.push(`industry = $${params.length}`);
    }
    params.push(limit);
    const { rows } = await this.pool.query(
      `SELECT * FROM industry_benchmarks WHERE ${conditions.join(" AND ")} ORDER BY calculated_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapIndustryBenchmark);
  }

  async appendSignatureDetection(event: SignatureDetectionEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO signature_detections (id, signature_id, organization_hash, detected_at) VALUES ($1,$2,$3,$4)`,
      [event.id, event.signatureId, event.organizationHash, event.detectedAt],
    );
  }

  async countDetectionsForSignature(signatureId: string): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM signature_detections WHERE signature_id = $1`,
      [signatureId],
    );
    return rows[0]?.count ?? 0;
  }

  async countDistinctOrgsForSignature(signatureId: string): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(DISTINCT organization_hash)::int AS count FROM signature_detections WHERE signature_id = $1 AND organization_hash IS NOT NULL`,
      [signatureId],
    );
    return rows[0]?.count ?? 0;
  }

  async deleteExpiredRiskSignalAggregates(cutoff: Date): Promise<number> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM risk_signal_aggregates WHERE signal_start_time < $1`,
      [cutoff],
    );
    return rowCount ?? 0;
  }

  async softDeleteExpiredSharingLogs(now: Date): Promise<number> {
    const { rowCount } = await this.pool.query(
      `UPDATE network_data_sharing_logs SET deleted_at = $1 WHERE deleted_at IS NULL AND retention_until < $1`,
      [now],
    );
    return rowCount ?? 0;
  }

  async createVulnerability(vulnerability: Vulnerability): Promise<void> {
    await this.pool.query(
      `INSERT INTO vulnerabilities
         (id, cve_id, vuln_status, description, cvss_version, cvss_base_score, cvss_base_severity, cvss_vector_string,
          weaknesses, affected_products, reference_urls, is_known_exploited, kev_added_at, kev_due_date,
          kev_required_action, kev_vulnerability_name, published_at, last_modified_at, ingested_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        vulnerability.id,
        vulnerability.cveId,
        vulnerability.vulnStatus,
        vulnerability.description,
        vulnerability.cvssVersion,
        vulnerability.cvssBaseScore,
        vulnerability.cvssBaseSeverity,
        vulnerability.cvssVectorString,
        vulnerability.weaknesses,
        vulnerability.affectedProducts,
        vulnerability.referenceUrls,
        vulnerability.isKnownExploited,
        vulnerability.kevAddedAt,
        vulnerability.kevDueDate,
        vulnerability.kevRequiredAction,
        vulnerability.kevVulnerabilityName,
        vulnerability.publishedAt,
        vulnerability.lastModifiedAt,
        vulnerability.ingestedAt,
        vulnerability.updatedAt,
      ],
    );
  }

  async updateVulnerability(vulnerability: Vulnerability): Promise<void> {
    await this.pool.query(
      `UPDATE vulnerabilities SET
         vuln_status = $2, description = $3, cvss_version = $4, cvss_base_score = $5, cvss_base_severity = $6,
         cvss_vector_string = $7, weaknesses = $8, affected_products = $9, reference_urls = $10,
         is_known_exploited = $11, kev_added_at = $12, kev_due_date = $13, kev_required_action = $14,
         kev_vulnerability_name = $15, last_modified_at = $16, updated_at = $17
       WHERE id = $1`,
      [
        vulnerability.id,
        vulnerability.vulnStatus,
        vulnerability.description,
        vulnerability.cvssVersion,
        vulnerability.cvssBaseScore,
        vulnerability.cvssBaseSeverity,
        vulnerability.cvssVectorString,
        vulnerability.weaknesses,
        vulnerability.affectedProducts,
        vulnerability.referenceUrls,
        vulnerability.isKnownExploited,
        vulnerability.kevAddedAt,
        vulnerability.kevDueDate,
        vulnerability.kevRequiredAction,
        vulnerability.kevVulnerabilityName,
        vulnerability.lastModifiedAt,
        vulnerability.updatedAt,
      ],
    );
  }

  async getVulnerabilityByCveId(cveId: string): Promise<Vulnerability | null> {
    const { rows } = await this.pool.query(`SELECT * FROM vulnerabilities WHERE cve_id = $1`, [cveId]);
    return rows[0] ? mapVulnerability(rows[0]) : null;
  }

  async searchVulnerabilities(query: VulnerabilitySearchQuery): Promise<Vulnerability[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (query.severity) {
      params.push(query.severity);
      conditions.push(`cvss_base_severity = $${params.length}`);
    }
    if (query.isKnownExploited !== undefined) {
      params.push(query.isKnownExploited);
      conditions.push(`is_known_exploited = $${params.length}`);
    }
    if (query.lastModifiedSince) {
      params.push(query.lastModifiedSince);
      conditions.push(`last_modified_at >= $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = query.limit ?? 200;
    params.push(limit);
    const { rows } = await this.pool.query(
      `SELECT * FROM vulnerabilities ${whereClause} ORDER BY last_modified_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapVulnerability);
  }

  async getMostRecentVulnerabilityLastModified(): Promise<Date | null> {
    const { rows } = await this.pool.query(`SELECT MAX(last_modified_at) as max_last_modified FROM vulnerabilities`);
    return rows[0]?.max_last_modified ?? null;
  }

  async createThreatActor(actor: ThreatActor): Promise<void> {
    await this.pool.query(
      `INSERT INTO threat_actors (id, mitre_group_id, name, aliases, description, source, is_active, related_pattern_ids, origin_country, targeted_countries, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        actor.id,
        actor.mitreGroupId,
        actor.name,
        actor.aliases,
        actor.description,
        actor.source,
        actor.isActive,
        actor.relatedPatternIds,
        actor.originCountry,
        actor.targetedCountries,
        actor.createdAt,
        actor.updatedAt,
      ],
    );
  }

  async updateThreatActor(actor: ThreatActor): Promise<void> {
    await this.pool.query(
      `UPDATE threat_actors SET
         name = $2, aliases = $3, description = $4, is_active = $5, related_pattern_ids = $6,
         origin_country = $7, targeted_countries = $8, updated_at = $9
       WHERE id = $1`,
      [
        actor.id,
        actor.name,
        actor.aliases,
        actor.description,
        actor.isActive,
        actor.relatedPatternIds,
        actor.originCountry,
        actor.targetedCountries,
        actor.updatedAt,
      ],
    );
  }

  async getThreatActorById(id: string): Promise<ThreatActor | null> {
    const { rows } = await this.pool.query(`SELECT * FROM threat_actors WHERE id = $1`, [id]);
    return rows[0] ? mapThreatActor(rows[0]) : null;
  }

  async getThreatActorByMitreGroupId(mitreGroupId: string): Promise<ThreatActor | null> {
    const { rows } = await this.pool.query(`SELECT * FROM threat_actors WHERE mitre_group_id = $1`, [mitreGroupId]);
    return rows[0] ? mapThreatActor(rows[0]) : null;
  }

  async searchThreatActors(query: ThreatActorSearchQuery): Promise<ThreatActor[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (query.source) {
      params.push(query.source);
      conditions.push(`source = $${params.length}`);
    }
    if (query.isActive !== undefined) {
      params.push(query.isActive);
      conditions.push(`is_active = $${params.length}`);
    }
    if (query.text) {
      params.push(`%${query.text}%`);
      conditions.push(`(name ILIKE $${params.length} OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE a ILIKE $${params.length}))`);
    }
    if (query.updatedSince) {
      params.push(query.updatedSince);
      conditions.push(`updated_at >= $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = query.limit ?? 200;
    params.push(limit);
    const { rows } = await this.pool.query(`SELECT * FROM threat_actors ${whereClause} ORDER BY name ASC LIMIT $${params.length}`, params);
    return rows.map(mapThreatActor);
  }

  async createIntelligenceReport(report: IntelligenceReport): Promise<void> {
    await this.pool.query(
      `INSERT INTO intelligence_reports
         (id, title, summary, body, related_pattern_ids, related_actor_ids, related_vulnerability_cve_ids, status, authored_by_staff_id, published_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        report.id,
        report.title,
        report.summary,
        report.body,
        report.relatedPatternIds,
        report.relatedActorIds,
        report.relatedVulnerabilityCveIds,
        report.status,
        report.authoredByStaffId,
        report.publishedAt,
        report.createdAt,
        report.updatedAt,
      ],
    );
  }

  async updateIntelligenceReport(report: IntelligenceReport): Promise<void> {
    await this.pool.query(
      `UPDATE intelligence_reports SET
         title = $2, summary = $3, body = $4, related_pattern_ids = $5, related_actor_ids = $6,
         related_vulnerability_cve_ids = $7, status = $8, published_at = $9, updated_at = $10
       WHERE id = $1`,
      [
        report.id,
        report.title,
        report.summary,
        report.body,
        report.relatedPatternIds,
        report.relatedActorIds,
        report.relatedVulnerabilityCveIds,
        report.status,
        report.publishedAt,
        report.updatedAt,
      ],
    );
  }

  async getIntelligenceReportById(id: string): Promise<IntelligenceReport | null> {
    const { rows } = await this.pool.query(`SELECT * FROM intelligence_reports WHERE id = $1`, [id]);
    return rows[0] ? mapIntelligenceReport(rows[0]) : null;
  }

  async searchIntelligenceReports(query: IntelligenceReportSearchQuery): Promise<IntelligenceReport[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${params.length}`);
    }
    if (query.text) {
      params.push(`%${query.text}%`);
      conditions.push(`(title ILIKE $${params.length} OR summary ILIKE $${params.length})`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = query.limit ?? 200;
    params.push(limit);
    const { rows } = await this.pool.query(
      `SELECT * FROM intelligence_reports ${whereClause} ORDER BY updated_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapIntelligenceReport);
  }

  async createCampaign(campaign: Campaign): Promise<void> {
    await this.pool.query(
      `INSERT INTO campaigns (id, mitre_campaign_id, name, aliases, description, source, first_seen, last_seen, attributed_actor_ids, is_active, origin_country, targeted_countries, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        campaign.id,
        campaign.mitreCampaignId,
        campaign.name,
        campaign.aliases,
        campaign.description,
        campaign.source,
        campaign.firstSeen,
        campaign.lastSeen,
        campaign.attributedActorIds,
        campaign.isActive,
        campaign.originCountry,
        campaign.targetedCountries,
        campaign.createdAt,
        campaign.updatedAt,
      ],
    );
  }

  async updateCampaign(campaign: Campaign): Promise<void> {
    await this.pool.query(
      `UPDATE campaigns SET
         name = $2, aliases = $3, description = $4, first_seen = $5, last_seen = $6,
         attributed_actor_ids = $7, is_active = $8, origin_country = $9, targeted_countries = $10, updated_at = $11
       WHERE id = $1`,
      [
        campaign.id,
        campaign.name,
        campaign.aliases,
        campaign.description,
        campaign.firstSeen,
        campaign.lastSeen,
        campaign.attributedActorIds,
        campaign.isActive,
        campaign.originCountry,
        campaign.targetedCountries,
        campaign.updatedAt,
      ],
    );
  }

  async getCampaignById(id: string): Promise<Campaign | null> {
    const { rows } = await this.pool.query(`SELECT * FROM campaigns WHERE id = $1`, [id]);
    return rows[0] ? mapCampaign(rows[0]) : null;
  }

  async getCampaignByMitreCampaignId(mitreCampaignId: string): Promise<Campaign | null> {
    const { rows } = await this.pool.query(`SELECT * FROM campaigns WHERE mitre_campaign_id = $1`, [mitreCampaignId]);
    return rows[0] ? mapCampaign(rows[0]) : null;
  }

  async searchCampaigns(query: CampaignSearchQuery): Promise<Campaign[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (query.source) {
      params.push(query.source);
      conditions.push(`source = $${params.length}`);
    }
    if (query.isActive !== undefined) {
      params.push(query.isActive);
      conditions.push(`is_active = $${params.length}`);
    }
    if (query.text) {
      params.push(`%${query.text}%`);
      conditions.push(`(name ILIKE $${params.length} OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE a ILIKE $${params.length}))`);
    }
    if (query.updatedSince) {
      params.push(query.updatedSince);
      conditions.push(`updated_at >= $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = query.limit ?? 200;
    params.push(limit);
    const { rows } = await this.pool.query(`SELECT * FROM campaigns ${whereClause} ORDER BY name ASC LIMIT $${params.length}`, params);
    return rows.map(mapCampaign);
  }

  async createTechnique(technique: Technique): Promise<void> {
    await this.pool.query(
      `INSERT INTO techniques
         (id, mitre_technique_id, name, description, tactics, is_subtechnique, parent_mitre_technique_id, platforms,
          used_by_actor_mitre_group_ids, used_by_campaign_mitre_campaign_ids, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        technique.id,
        technique.mitreTechniqueId,
        technique.name,
        technique.description,
        technique.tactics,
        technique.isSubtechnique,
        technique.parentMitreTechniqueId,
        technique.platforms,
        technique.usedByActorMitreGroupIds,
        technique.usedByCampaignMitreCampaignIds,
        technique.isActive,
        technique.createdAt,
        technique.updatedAt,
      ],
    );
  }

  async updateTechnique(technique: Technique): Promise<void> {
    await this.pool.query(
      `UPDATE techniques SET
         name = $2, description = $3, tactics = $4, is_subtechnique = $5, parent_mitre_technique_id = $6,
         platforms = $7, used_by_actor_mitre_group_ids = $8, used_by_campaign_mitre_campaign_ids = $9,
         is_active = $10, updated_at = $11
       WHERE id = $1`,
      [
        technique.id,
        technique.name,
        technique.description,
        technique.tactics,
        technique.isSubtechnique,
        technique.parentMitreTechniqueId,
        technique.platforms,
        technique.usedByActorMitreGroupIds,
        technique.usedByCampaignMitreCampaignIds,
        technique.isActive,
        technique.updatedAt,
      ],
    );
  }

  async getTechniqueById(id: string): Promise<Technique | null> {
    const { rows } = await this.pool.query(`SELECT * FROM techniques WHERE id = $1`, [id]);
    return rows[0] ? mapTechnique(rows[0]) : null;
  }

  async getTechniqueByMitreTechniqueId(mitreTechniqueId: string): Promise<Technique | null> {
    const { rows } = await this.pool.query(`SELECT * FROM techniques WHERE mitre_technique_id = $1`, [mitreTechniqueId]);
    return rows[0] ? mapTechnique(rows[0]) : null;
  }

  async searchTechniques(query: TechniqueSearchQuery): Promise<Technique[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (query.tactic) {
      params.push(query.tactic);
      conditions.push(`$${params.length} = ANY(tactics)`);
    }
    if (query.isSubtechnique !== undefined) {
      params.push(query.isSubtechnique);
      conditions.push(`is_subtechnique = $${params.length}`);
    }
    if (query.isActive !== undefined) {
      params.push(query.isActive);
      conditions.push(`is_active = $${params.length}`);
    }
    if (query.text) {
      params.push(`%${query.text}%`);
      conditions.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }
    if (query.updatedSince) {
      params.push(query.updatedSince);
      conditions.push(`updated_at >= $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = query.limit ?? 200;
    params.push(limit);
    const { rows } = await this.pool.query(
      `SELECT * FROM techniques ${whereClause} ORDER BY mitre_technique_id ASC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapTechnique);
  }

  async createMalware(malware: Malware): Promise<void> {
    await this.pool.query(
      `INSERT INTO malware
         (id, mitre_software_id, name, aliases, description, software_type, source, platforms,
          used_by_actor_mitre_group_ids, used_by_campaign_mitre_campaign_ids, uses_mitre_technique_ids,
          is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        malware.id,
        malware.mitreSoftwareId,
        malware.name,
        malware.aliases,
        malware.description,
        malware.softwareType,
        malware.source,
        malware.platforms,
        malware.usedByActorMitreGroupIds,
        malware.usedByCampaignMitreCampaignIds,
        malware.usesMitreTechniqueIds,
        malware.isActive,
        malware.createdAt,
        malware.updatedAt,
      ],
    );
  }

  async updateMalware(malware: Malware): Promise<void> {
    await this.pool.query(
      `UPDATE malware SET
         name = $2, aliases = $3, description = $4, software_type = $5, platforms = $6,
         used_by_actor_mitre_group_ids = $7, used_by_campaign_mitre_campaign_ids = $8,
         uses_mitre_technique_ids = $9, is_active = $10, updated_at = $11
       WHERE id = $1`,
      [
        malware.id,
        malware.name,
        malware.aliases,
        malware.description,
        malware.softwareType,
        malware.platforms,
        malware.usedByActorMitreGroupIds,
        malware.usedByCampaignMitreCampaignIds,
        malware.usesMitreTechniqueIds,
        malware.isActive,
        malware.updatedAt,
      ],
    );
  }

  async getMalwareById(id: string): Promise<Malware | null> {
    const { rows } = await this.pool.query(`SELECT * FROM malware WHERE id = $1`, [id]);
    return rows[0] ? mapMalware(rows[0]) : null;
  }

  async getMalwareByMitreSoftwareId(mitreSoftwareId: string): Promise<Malware | null> {
    const { rows } = await this.pool.query(`SELECT * FROM malware WHERE mitre_software_id = $1`, [mitreSoftwareId]);
    return rows[0] ? mapMalware(rows[0]) : null;
  }

  async searchMalware(query: MalwareSearchQuery): Promise<Malware[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (query.softwareType) {
      params.push(query.softwareType);
      conditions.push(`software_type = $${params.length}`);
    }
    if (query.source) {
      params.push(query.source);
      conditions.push(`source = $${params.length}`);
    }
    if (query.isActive !== undefined) {
      params.push(query.isActive);
      conditions.push(`is_active = $${params.length}`);
    }
    if (query.text) {
      params.push(`%${query.text}%`);
      conditions.push(`(name ILIKE $${params.length} OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE a ILIKE $${params.length}))`);
    }
    if (query.updatedSince) {
      params.push(query.updatedSince);
      conditions.push(`updated_at >= $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = query.limit ?? 200;
    params.push(limit);
    const { rows } = await this.pool.query(`SELECT * FROM malware ${whereClause} ORDER BY name ASC LIMIT $${params.length}`, params);
    return rows.map(mapMalware);
  }

  async createIoc(ioc: Ioc): Promise<void> {
    await this.pool.query(
      `INSERT INTO iocs
         (id, ioc_type, value, threat_type, description, source, related_pattern_ids, related_actor_ids,
          related_campaign_ids, related_malware_ids, is_active, first_seen_at, last_seen_at, created_by_staff_id,
          created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        ioc.id,
        ioc.iocType,
        ioc.value,
        ioc.threatType,
        ioc.description,
        ioc.source,
        ioc.relatedPatternIds,
        ioc.relatedActorIds,
        ioc.relatedCampaignIds,
        ioc.relatedMalwareIds,
        ioc.isActive,
        ioc.firstSeenAt,
        ioc.lastSeenAt,
        ioc.createdByStaffId,
        ioc.createdAt,
        ioc.updatedAt,
      ],
    );
  }

  async updateIoc(ioc: Ioc): Promise<void> {
    await this.pool.query(
      `UPDATE iocs SET
         threat_type = $2, description = $3, related_pattern_ids = $4, related_actor_ids = $5,
         related_campaign_ids = $6, related_malware_ids = $7, is_active = $8, first_seen_at = $9,
         last_seen_at = $10, updated_at = $11
       WHERE id = $1`,
      [
        ioc.id,
        ioc.threatType,
        ioc.description,
        ioc.relatedPatternIds,
        ioc.relatedActorIds,
        ioc.relatedCampaignIds,
        ioc.relatedMalwareIds,
        ioc.isActive,
        ioc.firstSeenAt,
        ioc.lastSeenAt,
        ioc.updatedAt,
      ],
    );
  }

  async getIocById(id: string): Promise<Ioc | null> {
    const { rows } = await this.pool.query(`SELECT * FROM iocs WHERE id = $1`, [id]);
    return rows[0] ? mapIoc(rows[0]) : null;
  }

  async getIocByTypeAndValue(iocType: Ioc["iocType"], value: string): Promise<Ioc | null> {
    const { rows } = await this.pool.query(`SELECT * FROM iocs WHERE ioc_type = $1 AND value = $2`, [iocType, value]);
    return rows[0] ? mapIoc(rows[0]) : null;
  }

  async searchIocs(query: IocSearchQuery): Promise<Ioc[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (query.iocType) {
      params.push(query.iocType);
      conditions.push(`ioc_type = $${params.length}`);
    }
    if (query.source) {
      params.push(query.source);
      conditions.push(`source = $${params.length}`);
    }
    if (query.isActive !== undefined) {
      params.push(query.isActive);
      conditions.push(`is_active = $${params.length}`);
    }
    if (query.text) {
      params.push(`%${query.text}%`);
      conditions.push(`(value ILIKE $${params.length} OR threat_type ILIKE $${params.length})`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = query.limit ?? 200;
    params.push(limit);
    const { rows } = await this.pool.query(`SELECT * FROM iocs ${whereClause} ORDER BY created_at DESC LIMIT $${params.length}`, params);
    return rows.map(mapIoc);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPattern(row: any): ThreatPattern {
  return {
    id: row.id,
    patternId: row.pattern_id,
    patternName: row.pattern_name,
    threatType: row.threat_type,
    severity: row.severity,
    description: row.description,
    attackVector: row.attack_vector,
    indicatorsOfCompromise: row.indicators_of_compromise,
    detectionSignature: row.detection_signature,
    confidenceThreshold: row.confidence_threshold,
    firstObserved: row.first_observed,
    lastObserved: row.last_observed,
    totalObservations: row.total_observations,
    affectedOrganizationsCount: row.affected_organizations_count,
    affectedIndustries: row.affected_industries,
    avgSeverityScore: row.avg_severity_score,
    successRate: row.success_rate,
    estimatedPrevalence: row.estimated_prevalence,
    mitigationSteps: row.mitigation_steps,
    remediationGuidance: row.remediation_guidance,
    isActive: row.is_active,
    isFalsePositive: row.is_false_positive,
    verifiedByAnalyst: row.verified_by_analyst,
    externalReferences: row.external_references,
    relatedPatternIds: row.related_pattern_ids,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSignature(row: any): PromptAbuseSignature {
  return {
    id: row.id,
    signatureId: row.signature_id,
    signatureName: row.signature_name,
    category: row.category,
    patternRegex: row.pattern_regex,
    patternKeywords: row.pattern_keywords,
    detectionLogic: row.detection_logic,
    matchThreshold: row.match_threshold,
    discoveredFromOrgCount: row.discovered_from_org_count,
    totalDetections: row.total_detections,
    falsePositiveRate: row.false_positive_rate,
    severity: row.severity,
    riskScore: row.risk_score,
    examplePrompts: row.example_prompts,
    isActive: row.is_active,
    isExperimental: row.is_experimental,
    relatedThreatPatternId: row.related_threat_pattern_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastDetection: row.last_detection,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapConsent(row: any): OrganizationConsent {
  return {
    organizationId: row.organization_id,
    shareRiskSignals: row.share_risk_signals,
    shareThreatPatterns: row.share_threat_patterns,
    shareBenchmarkData: row.share_benchmark_data,
    anonymizationLevel: row.anonymization_level,
    dataRetentionDays: row.data_retention_days,
    consentVersion: row.consent_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDeletionRequest(row: any): DeletionRequest {
  return {
    id: row.id,
    organizationId: row.organization_id,
    reason: row.reason,
    deleteAll: row.delete_all,
    dataTypes: row.data_types,
    status: row.status,
    estimatedRecords: row.estimated_records,
    actualRecordsDeleted: row.actual_records_deleted,
    requestedAt: row.requested_at,
    processedAt: row.processed_at,
    processedByStaffId: row.processed_by_staff_id,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRiskSignalAggregate(row: any): RiskSignalAggregate {
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
function mapIndustryBenchmark(row: any): IndustryBenchmark {
  return {
    id: row.id,
    industry: row.industry,
    metric: row.metric,
    benchmarkPeriod: row.benchmark_period,
    percentile10: row.percentile_10,
    percentile25: row.percentile_25,
    percentile50: row.percentile_50,
    percentile75: row.percentile_75,
    percentile90: row.percentile_90,
    meanValue: row.mean_value,
    stdDeviation: row.std_deviation,
    sampleSize: row.sample_size,
    totalDataPoints: row.total_data_points,
    minValue: row.min_value,
    maxValue: row.max_value,
    confidenceScore: row.confidence_score,
    dataQualityScore: row.data_quality_score,
    calculatedAt: row.calculated_at,
    validUntil: row.valid_until,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapVulnerability(row: any): Vulnerability {
  return {
    id: row.id,
    cveId: row.cve_id,
    vulnStatus: row.vuln_status,
    description: row.description,
    cvssVersion: row.cvss_version,
    cvssBaseScore: row.cvss_base_score !== null ? Number(row.cvss_base_score) : null,
    cvssBaseSeverity: row.cvss_base_severity,
    cvssVectorString: row.cvss_vector_string,
    weaknesses: row.weaknesses,
    affectedProducts: row.affected_products,
    referenceUrls: row.reference_urls,
    isKnownExploited: row.is_known_exploited,
    kevAddedAt: row.kev_added_at,
    kevDueDate: row.kev_due_date,
    kevRequiredAction: row.kev_required_action,
    kevVulnerabilityName: row.kev_vulnerability_name,
    publishedAt: row.published_at,
    lastModifiedAt: row.last_modified_at,
    ingestedAt: row.ingested_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapThreatActor(row: any): ThreatActor {
  return {
    id: row.id,
    mitreGroupId: row.mitre_group_id,
    name: row.name,
    aliases: row.aliases,
    description: row.description,
    source: row.source,
    isActive: row.is_active,
    relatedPatternIds: row.related_pattern_ids,
    originCountry: row.origin_country,
    targetedCountries: row.targeted_countries,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapIntelligenceReport(row: any): IntelligenceReport {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    body: row.body,
    relatedPatternIds: row.related_pattern_ids,
    relatedActorIds: row.related_actor_ids,
    relatedVulnerabilityCveIds: row.related_vulnerability_cve_ids,
    status: row.status,
    authoredByStaffId: row.authored_by_staff_id,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCampaign(row: any): Campaign {
  return {
    id: row.id,
    mitreCampaignId: row.mitre_campaign_id,
    name: row.name,
    aliases: row.aliases,
    description: row.description,
    source: row.source,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    attributedActorIds: row.attributed_actor_ids,
    isActive: row.is_active,
    originCountry: row.origin_country,
    targetedCountries: row.targeted_countries,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTechnique(row: any): Technique {
  return {
    id: row.id,
    mitreTechniqueId: row.mitre_technique_id,
    name: row.name,
    description: row.description,
    tactics: row.tactics,
    isSubtechnique: row.is_subtechnique,
    parentMitreTechniqueId: row.parent_mitre_technique_id,
    platforms: row.platforms,
    usedByActorMitreGroupIds: row.used_by_actor_mitre_group_ids,
    usedByCampaignMitreCampaignIds: row.used_by_campaign_mitre_campaign_ids,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMalware(row: any): Malware {
  return {
    id: row.id,
    mitreSoftwareId: row.mitre_software_id,
    name: row.name,
    aliases: row.aliases,
    description: row.description,
    softwareType: row.software_type,
    source: row.source,
    platforms: row.platforms,
    usedByActorMitreGroupIds: row.used_by_actor_mitre_group_ids,
    usedByCampaignMitreCampaignIds: row.used_by_campaign_mitre_campaign_ids,
    usesMitreTechniqueIds: row.uses_mitre_technique_ids,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapIoc(row: any): Ioc {
  return {
    id: row.id,
    iocType: row.ioc_type,
    value: row.value,
    threatType: row.threat_type,
    description: row.description,
    source: row.source,
    relatedPatternIds: row.related_pattern_ids,
    relatedActorIds: row.related_actor_ids,
    relatedCampaignIds: row.related_campaign_ids,
    relatedMalwareIds: row.related_malware_ids,
    isActive: row.is_active,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    createdByStaffId: row.created_by_staff_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
