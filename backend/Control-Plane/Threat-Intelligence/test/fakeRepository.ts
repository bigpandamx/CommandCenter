import type { ThreatIntelRepository } from "../src/repository.js";
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
} from "../src/types.js";
import type { OrganizationConsent } from "../src/consent.js";
import type { DataSharingLogEntry, ThreatPatternObservation } from "../src/observations.js";
import type { DeletionRequest } from "../src/deletionRequests.js";
import type { RiskSignalAggregate } from "../src/riskSignals.js";
import type { IndustryBenchmark, BenchmarkMetric } from "../src/benchmarks.js";
import type { SignatureDetectionEvent } from "../src/signatureDetections.js";

export class FakeThreatIntelRepository implements ThreatIntelRepository {
  patterns = new Map<string, ThreatPattern>();
  patternsByPatternId = new Map<string, string>(); // patternId -> id
  signatures = new Map<string, PromptAbuseSignature>();
  vulnerabilities = new Map<string, Vulnerability>(); // keyed by id
  threatActors = new Map<string, ThreatActor>(); // keyed by id
  intelligenceReports = new Map<string, IntelligenceReport>(); // keyed by id
  campaigns = new Map<string, Campaign>(); // keyed by id
  techniques = new Map<string, Technique>(); // keyed by id
  malwareItems = new Map<string, Malware>(); // keyed by id
  iocs = new Map<string, Ioc>(); // keyed by id
  signaturesBySignatureId = new Map<string, string>();
  consents = new Map<string, OrganizationConsent>();
  observations: ThreatPatternObservation[] = [];
  dataSharingLogs: DataSharingLogEntry[] = [];
  deletionRequests = new Map<string, DeletionRequest>();
  riskSignalAggregates: RiskSignalAggregate[] = [];
  industryBenchmarks = new Map<string, IndustryBenchmark>(); // key: industry|metric|period
  signatureDetections: SignatureDetectionEvent[] = [];

  async createPattern(pattern: ThreatPattern) {
    this.patterns.set(pattern.id, pattern);
    this.patternsByPatternId.set(pattern.patternId, pattern.id);
  }

  async getPatternById(id: string) {
    return this.patterns.get(id) ?? null;
  }

  async getPatternByPatternId(patternId: string) {
    const id = this.patternsByPatternId.get(patternId);
    return id ? this.patterns.get(id) ?? null : null;
  }

  async updatePattern(pattern: ThreatPattern) {
    this.patterns.set(pattern.id, pattern);
  }

  async searchPatterns(query: ThreatPatternSearchQuery) {
    let matches = [...this.patterns.values()];
    if (query.severity) matches = matches.filter((p) => p.severity === query.severity);
    if (query.threatType) matches = matches.filter((p) => p.threatType === query.threatType);
    if (query.isActive !== undefined) matches = matches.filter((p) => p.isActive === query.isActive);
    if (query.updatedSince) {
      const since = query.updatedSince;
      matches = matches.filter((p) => p.updatedAt.getTime() >= since.getTime());
    }
    if (query.text) {
      const needle = query.text.toLowerCase();
      matches = matches.filter(
        (p) => p.patternName.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle),
      );
    }
    return matches.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async createSignature(signature: PromptAbuseSignature) {
    this.signatures.set(signature.id, signature);
    this.signaturesBySignatureId.set(signature.signatureId, signature.id);
  }

  async getSignatureById(id: string) {
    return this.signatures.get(id) ?? null;
  }

  async getSignatureBySignatureId(signatureId: string) {
    const id = this.signaturesBySignatureId.get(signatureId);
    return id ? this.signatures.get(id) ?? null : null;
  }

  async updateSignature(signature: PromptAbuseSignature) {
    this.signatures.set(signature.id, signature);
  }

  async searchSignatures(query: SignatureSearchQuery) {
    let matches = [...this.signatures.values()];
    if (query.category) matches = matches.filter((s) => s.category === query.category);
    if (query.severity) matches = matches.filter((s) => s.severity === query.severity);
    if (query.isActive !== undefined) matches = matches.filter((s) => s.isActive === query.isActive);
    if (query.updatedSince) {
      const since = query.updatedSince;
      matches = matches.filter((s) => s.updatedAt.getTime() >= since.getTime());
    }
    if (query.text) {
      const needle = query.text.toLowerCase();
      matches = matches.filter((s) => s.signatureName.toLowerCase().includes(needle));
    }
    return matches.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getConsent(organizationId: string) {
    return this.consents.get(organizationId) ?? null;
  }

  async upsertConsent(consent: OrganizationConsent) {
    this.consents.set(consent.organizationId, consent);
  }

  async appendObservation(observation: ThreatPatternObservation) {
    this.observations.push(observation);
  }

  async countObservationsForPattern(threatPatternId: string) {
    return this.observations.filter((o) => o.threatPatternId === threatPatternId).length;
  }

  async countDistinctOrgsForPattern(threatPatternId: string) {
    const hashes = new Set(
      this.observations.filter((o) => o.threatPatternId === threatPatternId).map((o) => o.organizationHash),
    );
    return hashes.size;
  }

  async recordDataSharingLog(entry: DataSharingLogEntry) {
    this.dataSharingLogs.push(entry);
  }

  async createDeletionRequest(request: DeletionRequest) {
    this.deletionRequests.set(request.id, request);
  }

  async getDeletionRequestById(id: string) {
    return this.deletionRequests.get(id) ?? null;
  }

  async listDeletionRequestsForOrg(organizationId: string) {
    return [...this.deletionRequests.values()]
      .filter((r) => r.organizationId === organizationId)
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
  }

  async updateDeletionRequest(request: DeletionRequest) {
    this.deletionRequests.set(request.id, request);
  }

  async countObservationsForOrgHash(organizationHash: string) {
    return this.observations.filter((o) => o.organizationHash === organizationHash).length;
  }

  async countSharingLogsForOrg(organizationId: string) {
    return this.dataSharingLogs.filter((l) => l.organizationId === organizationId).length;
  }

  async deleteObservationsForOrgHash(organizationHash: string) {
    const before = this.observations.length;
    this.observations = this.observations.filter((o) => o.organizationHash !== organizationHash);
    return before - this.observations.length;
  }

  async deleteSharingLogsForOrg(organizationId: string) {
    const before = this.dataSharingLogs.length;
    this.dataSharingLogs = this.dataSharingLogs.filter((l) => l.organizationId !== organizationId);
    return before - this.dataSharingLogs.length;
  }

  async createRiskSignalAggregate(aggregate: RiskSignalAggregate) {
    this.riskSignalAggregates.push(aggregate);
  }

  async listRiskSignalAggregates(industry: string, since: Date) {
    return this.riskSignalAggregates.filter(
      (a) => a.industry === industry && a.signalStartTime.getTime() >= since.getTime(),
    );
  }

  async upsertIndustryBenchmark(benchmark: IndustryBenchmark) {
    this.industryBenchmarks.set(`${benchmark.industry}|${benchmark.metric}|${benchmark.benchmarkPeriod}`, benchmark);
  }

  async getIndustryBenchmark(industry: string, metric: BenchmarkMetric, benchmarkPeriod: string) {
    return this.industryBenchmarks.get(`${industry}|${metric}|${benchmarkPeriod}`) ?? null;
  }

  async listBenchmarks(industry: string | undefined, limit: number, now: Date) {
    let matches = [...this.industryBenchmarks.values()].filter((b) => b.validUntil.getTime() > now.getTime());
    if (industry) matches = matches.filter((b) => b.industry === industry);
    matches = matches.sort((a, b) => b.calculatedAt.getTime() - a.calculatedAt.getTime());
    return matches.slice(0, limit);
  }

  async appendSignatureDetection(event: SignatureDetectionEvent) {
    this.signatureDetections.push(event);
  }

  async countDetectionsForSignature(signatureId: string) {
    return this.signatureDetections.filter((d) => d.signatureId === signatureId).length;
  }

  async countDistinctOrgsForSignature(signatureId: string) {
    const hashes = new Set(
      this.signatureDetections
        .filter((d) => d.signatureId === signatureId && d.organizationHash !== null)
        .map((d) => d.organizationHash as string),
    );
    return hashes.size;
  }

  async deleteExpiredRiskSignalAggregates(cutoff: Date) {
    const before = this.riskSignalAggregates.length;
    this.riskSignalAggregates = this.riskSignalAggregates.filter((a) => a.signalStartTime.getTime() >= cutoff.getTime());
    return before - this.riskSignalAggregates.length;
  }

  async softDeleteExpiredSharingLogs(now: Date) {
    let count = 0;
    this.dataSharingLogs = this.dataSharingLogs.map((log) => {
      if (log.deletedAt === null && log.retentionUntil.getTime() < now.getTime()) {
        count += 1;
        return { ...log, deletedAt: now };
      }
      return log;
    });
    return count;
  }

  async createVulnerability(vulnerability: Vulnerability) {
    this.vulnerabilities.set(vulnerability.id, vulnerability);
  }
  async updateVulnerability(vulnerability: Vulnerability) {
    this.vulnerabilities.set(vulnerability.id, vulnerability);
  }
  async getVulnerabilityByCveId(cveId: string) {
    return [...this.vulnerabilities.values()].find((v) => v.cveId === cveId) ?? null;
  }
  async searchVulnerabilities(query: VulnerabilitySearchQuery) {
    let all = [...this.vulnerabilities.values()];
    if (query.severity) {
      all = all.filter((v) => v.cvssBaseSeverity === query.severity);
    }
    if (query.isKnownExploited !== undefined) {
      all = all.filter((v) => v.isKnownExploited === query.isKnownExploited);
    }
    if (query.lastModifiedSince) {
      all = all.filter((v) => v.lastModifiedAt.getTime() >= query.lastModifiedSince!.getTime());
    }
    all = all.sort((a, b) => b.lastModifiedAt.getTime() - a.lastModifiedAt.getTime());
    return query.limit ? all.slice(0, query.limit) : all;
  }
  async getMostRecentVulnerabilityLastModified() {
    const all = [...this.vulnerabilities.values()];
    if (all.length === 0) return null;
    return all.reduce((latest, v) => (v.lastModifiedAt.getTime() > latest.getTime() ? v.lastModifiedAt : latest), all[0]!.lastModifiedAt);
  }

  async createThreatActor(actor: ThreatActor) {
    this.threatActors.set(actor.id, actor);
  }
  async updateThreatActor(actor: ThreatActor) {
    this.threatActors.set(actor.id, actor);
  }
  async getThreatActorById(id: string) {
    return this.threatActors.get(id) ?? null;
  }
  async getThreatActorByMitreGroupId(mitreGroupId: string) {
    return [...this.threatActors.values()].find((a) => a.mitreGroupId === mitreGroupId) ?? null;
  }
  async searchThreatActors(query: ThreatActorSearchQuery) {
    let all = [...this.threatActors.values()];
    if (query.source) {
      all = all.filter((a) => a.source === query.source);
    }
    if (query.isActive !== undefined) {
      all = all.filter((a) => a.isActive === query.isActive);
    }
    if (query.text) {
      const lowered = query.text.toLowerCase();
      all = all.filter(
        (a) => a.name.toLowerCase().includes(lowered) || (a.aliases ?? []).some((alias) => alias.toLowerCase().includes(lowered)),
      );
    }
    if (query.updatedSince) {
      all = all.filter((a) => a.updatedAt.getTime() >= query.updatedSince!.getTime());
    }
    all = all.sort((a, b) => a.name.localeCompare(b.name));
    return query.limit ? all.slice(0, query.limit) : all;
  }

  async createIntelligenceReport(report: IntelligenceReport) {
    this.intelligenceReports.set(report.id, report);
  }
  async updateIntelligenceReport(report: IntelligenceReport) {
    this.intelligenceReports.set(report.id, report);
  }
  async getIntelligenceReportById(id: string) {
    return this.intelligenceReports.get(id) ?? null;
  }
  async searchIntelligenceReports(query: IntelligenceReportSearchQuery) {
    let all = [...this.intelligenceReports.values()];
    if (query.status) {
      all = all.filter((r) => r.status === query.status);
    }
    if (query.text) {
      const lowered = query.text.toLowerCase();
      all = all.filter((r) => r.title.toLowerCase().includes(lowered) || r.summary.toLowerCase().includes(lowered));
    }
    all = all.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return query.limit ? all.slice(0, query.limit) : all;
  }

  async createCampaign(campaign: Campaign) {
    this.campaigns.set(campaign.id, campaign);
  }
  async updateCampaign(campaign: Campaign) {
    this.campaigns.set(campaign.id, campaign);
  }
  async getCampaignById(id: string) {
    return this.campaigns.get(id) ?? null;
  }
  async getCampaignByMitreCampaignId(mitreCampaignId: string) {
    return [...this.campaigns.values()].find((c) => c.mitreCampaignId === mitreCampaignId) ?? null;
  }
  async searchCampaigns(query: CampaignSearchQuery) {
    let all = [...this.campaigns.values()];
    if (query.source) {
      all = all.filter((c) => c.source === query.source);
    }
    if (query.isActive !== undefined) {
      all = all.filter((c) => c.isActive === query.isActive);
    }
    if (query.text) {
      const lowered = query.text.toLowerCase();
      all = all.filter((c) => c.name.toLowerCase().includes(lowered) || (c.aliases ?? []).some((alias) => alias.toLowerCase().includes(lowered)));
    }
    if (query.updatedSince) {
      all = all.filter((c) => c.updatedAt.getTime() >= query.updatedSince!.getTime());
    }
    all = all.sort((a, b) => a.name.localeCompare(b.name));
    return query.limit ? all.slice(0, query.limit) : all;
  }

  async createTechnique(technique: Technique) {
    this.techniques.set(technique.id, technique);
  }
  async updateTechnique(technique: Technique) {
    this.techniques.set(technique.id, technique);
  }
  async getTechniqueById(id: string) {
    return this.techniques.get(id) ?? null;
  }
  async getTechniqueByMitreTechniqueId(mitreTechniqueId: string) {
    return [...this.techniques.values()].find((t) => t.mitreTechniqueId === mitreTechniqueId) ?? null;
  }
  async searchTechniques(query: TechniqueSearchQuery) {
    let all = [...this.techniques.values()];
    if (query.tactic) {
      all = all.filter((t) => (t.tactics ?? []).includes(query.tactic!));
    }
    if (query.isSubtechnique !== undefined) {
      all = all.filter((t) => t.isSubtechnique === query.isSubtechnique);
    }
    if (query.isActive !== undefined) {
      all = all.filter((t) => t.isActive === query.isActive);
    }
    if (query.text) {
      const lowered = query.text.toLowerCase();
      all = all.filter((t) => t.name.toLowerCase().includes(lowered) || t.description.toLowerCase().includes(lowered));
    }
    if (query.updatedSince) {
      all = all.filter((t) => t.updatedAt.getTime() >= query.updatedSince!.getTime());
    }
    all = all.sort((a, b) => (a.mitreTechniqueId ?? a.name).localeCompare(b.mitreTechniqueId ?? b.name));
    return query.limit ? all.slice(0, query.limit) : all;
  }

  async createMalware(malware: Malware) {
    this.malwareItems.set(malware.id, malware);
  }
  async updateMalware(malware: Malware) {
    this.malwareItems.set(malware.id, malware);
  }
  async getMalwareById(id: string) {
    return this.malwareItems.get(id) ?? null;
  }
  async getMalwareByMitreSoftwareId(mitreSoftwareId: string) {
    return [...this.malwareItems.values()].find((m) => m.mitreSoftwareId === mitreSoftwareId) ?? null;
  }
  async searchMalware(query: MalwareSearchQuery) {
    let all = [...this.malwareItems.values()];
    if (query.softwareType) {
      all = all.filter((m) => m.softwareType === query.softwareType);
    }
    if (query.source) {
      all = all.filter((m) => m.source === query.source);
    }
    if (query.isActive !== undefined) {
      all = all.filter((m) => m.isActive === query.isActive);
    }
    if (query.text) {
      const lowered = query.text.toLowerCase();
      all = all.filter(
        (m) => m.name.toLowerCase().includes(lowered) || (m.aliases ?? []).some((alias) => alias.toLowerCase().includes(lowered)),
      );
    }
    if (query.updatedSince) {
      all = all.filter((m) => m.updatedAt.getTime() >= query.updatedSince!.getTime());
    }
    all = all.sort((a, b) => a.name.localeCompare(b.name));
    return query.limit ? all.slice(0, query.limit) : all;
  }

  async createIoc(ioc: Ioc) {
    this.iocs.set(ioc.id, ioc);
  }
  async updateIoc(ioc: Ioc) {
    this.iocs.set(ioc.id, ioc);
  }
  async getIocById(id: string) {
    return this.iocs.get(id) ?? null;
  }
  async getIocByTypeAndValue(iocType: Ioc["iocType"], value: string) {
    return [...this.iocs.values()].find((i) => i.iocType === iocType && i.value === value) ?? null;
  }
  async searchIocs(query: IocSearchQuery) {
    let all = [...this.iocs.values()];
    if (query.iocType) {
      all = all.filter((i) => i.iocType === query.iocType);
    }
    if (query.source) {
      all = all.filter((i) => i.source === query.source);
    }
    if (query.isActive !== undefined) {
      all = all.filter((i) => i.isActive === query.isActive);
    }
    if (query.text) {
      const lowered = query.text.toLowerCase();
      all = all.filter(
        (i) => i.value.toLowerCase().includes(lowered) || (i.threatType ?? "").toLowerCase().includes(lowered),
      );
    }
    all = all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return query.limit ? all.slice(0, query.limit) : all;
  }
}
