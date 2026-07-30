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
} from "./types.js";
import type { OrganizationConsent } from "./consent.js";
import type { DataSharingLogEntry, ThreatPatternObservation } from "./observations.js";
import type { DeletionRequest } from "./deletionRequests.js";
import type { RiskSignalAggregate } from "./riskSignals.js";
import type { IndustryBenchmark, BenchmarkMetric } from "./benchmarks.js";
import type { SignatureDetectionEvent } from "./signatureDetections.js";

export interface ThreatIntelRepository {
  createPattern(pattern: ThreatPattern): Promise<void>;
  getPatternById(id: string): Promise<ThreatPattern | null>;
  getPatternByPatternId(patternId: string): Promise<ThreatPattern | null>;
  updatePattern(pattern: ThreatPattern): Promise<void>;
  searchPatterns(query: ThreatPatternSearchQuery): Promise<ThreatPattern[]>;

  createSignature(signature: PromptAbuseSignature): Promise<void>;
  getSignatureById(id: string): Promise<PromptAbuseSignature | null>;
  getSignatureBySignatureId(signatureId: string): Promise<PromptAbuseSignature | null>;
  updateSignature(signature: PromptAbuseSignature): Promise<void>;
  searchSignatures(query: SignatureSearchQuery): Promise<PromptAbuseSignature[]>;

  getConsent(organizationId: string): Promise<OrganizationConsent | null>;
  upsertConsent(consent: OrganizationConsent): Promise<void>;

  appendObservation(observation: ThreatPatternObservation): Promise<void>;
  /** Total observation count for a pattern -- COUNT(*) equivalent. */
  countObservationsForPattern(threatPatternId: string): Promise<number>;
  /** Distinct reporting-org count for a pattern -- COUNT(DISTINCT organization_hash) equivalent. See observations.ts's doc comment for why this is counted properly instead of incremented unconditionally. */
  countDistinctOrgsForPattern(threatPatternId: string): Promise<number>;

  recordDataSharingLog(entry: DataSharingLogEntry): Promise<void>;

  createDeletionRequest(request: DeletionRequest): Promise<void>;
  getDeletionRequestById(id: string): Promise<DeletionRequest | null>;
  listDeletionRequestsForOrg(organizationId: string): Promise<DeletionRequest[]>;
  updateDeletionRequest(request: DeletionRequest): Promise<void>;
  countObservationsForOrgHash(organizationHash: string): Promise<number>;
  countSharingLogsForOrg(organizationId: string): Promise<number>;
  /** Returns the number of rows actually deleted. */
  deleteObservationsForOrgHash(organizationHash: string): Promise<number>;
  deleteSharingLogsForOrg(organizationId: string): Promise<number>;

  createRiskSignalAggregate(aggregate: RiskSignalAggregate): Promise<void>;
  /** All aggregates for an industry with signalStartTime >= since -- the raw material calculateIndustryBenchmark works from. */
  listRiskSignalAggregates(industry: string, since: Date): Promise<RiskSignalAggregate[]>;

  upsertIndustryBenchmark(benchmark: IndustryBenchmark): Promise<void>;
  getIndustryBenchmark(industry: string, metric: BenchmarkMetric, benchmarkPeriod: string): Promise<IndustryBenchmark | null>;
  /** All currently-valid (validUntil > now) benchmarks, optionally filtered by industry. */
  listBenchmarks(industry: string | undefined, limit: number, now: Date): Promise<IndustryBenchmark[]>;

  appendSignatureDetection(event: SignatureDetectionEvent): Promise<void>;
  countDetectionsForSignature(signatureId: string): Promise<number>;
  countDistinctOrgsForSignature(signatureId: string): Promise<number>;

  /** Hard-deletes risk signal aggregates with signalStartTime before the cutoff. Returns the count deleted. */
  deleteExpiredRiskSignalAggregates(cutoff: Date): Promise<number>;
  /** Soft-deletes (marks, doesn't remove) sharing logs whose retentionUntil has passed. Returns the count marked. Unlike Aegis's version, there's no deletion_request/deletion_completed dataType to exclude here -- this module's deletion-request workflow (deletionRequests.ts) already lives in its own dedicated table, not mixed into the sharing log, so every row in this table is a genuine sharing-audit entry. */
  softDeleteExpiredSharingLogs(now: Date): Promise<number>;

  createVulnerability(vulnerability: Vulnerability): Promise<void>;
  updateVulnerability(vulnerability: Vulnerability): Promise<void>;
  getVulnerabilityByCveId(cveId: string): Promise<Vulnerability | null>;
  searchVulnerabilities(query: VulnerabilitySearchQuery): Promise<Vulnerability[]>;
  /** The most recent lastModifiedAt across every stored vulnerability -- the self-derived sync-window high-water mark, see computeSyncWindow's own doc comment. Null when nothing has ever been ingested. */
  getMostRecentVulnerabilityLastModified(): Promise<Date | null>;

  createThreatActor(actor: ThreatActor): Promise<void>;
  updateThreatActor(actor: ThreatActor): Promise<void>;
  getThreatActorById(id: string): Promise<ThreatActor | null>;
  getThreatActorByMitreGroupId(mitreGroupId: string): Promise<ThreatActor | null>;
  searchThreatActors(query: ThreatActorSearchQuery): Promise<ThreatActor[]>;

  createIntelligenceReport(report: IntelligenceReport): Promise<void>;
  updateIntelligenceReport(report: IntelligenceReport): Promise<void>;
  getIntelligenceReportById(id: string): Promise<IntelligenceReport | null>;
  searchIntelligenceReports(query: IntelligenceReportSearchQuery): Promise<IntelligenceReport[]>;

  createCampaign(campaign: Campaign): Promise<void>;
  updateCampaign(campaign: Campaign): Promise<void>;
  getCampaignById(id: string): Promise<Campaign | null>;
  getCampaignByMitreCampaignId(mitreCampaignId: string): Promise<Campaign | null>;
  searchCampaigns(query: CampaignSearchQuery): Promise<Campaign[]>;

  createTechnique(technique: Technique): Promise<void>;
  updateTechnique(technique: Technique): Promise<void>;
  getTechniqueById(id: string): Promise<Technique | null>;
  getTechniqueByMitreTechniqueId(mitreTechniqueId: string): Promise<Technique | null>;
  searchTechniques(query: TechniqueSearchQuery): Promise<Technique[]>;

  createMalware(malware: Malware): Promise<void>;
  updateMalware(malware: Malware): Promise<void>;
  getMalwareById(id: string): Promise<Malware | null>;
  getMalwareByMitreSoftwareId(mitreSoftwareId: string): Promise<Malware | null>;
  searchMalware(query: MalwareSearchQuery): Promise<Malware[]>;

  createIoc(ioc: Ioc): Promise<void>;
  updateIoc(ioc: Ioc): Promise<void>;
  getIocById(id: string): Promise<Ioc | null>;
  getIocByTypeAndValue(iocType: Ioc["iocType"], value: string): Promise<Ioc | null>;
  searchIocs(query: IocSearchQuery): Promise<Ioc[]>;
}
