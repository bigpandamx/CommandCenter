import { test } from "node:test";
import assert from "node:assert/strict";
import { getExecutiveDashboard } from "../src/executiveDashboardService.js";
import { FakeComplianceRepository } from "../../Compliance/test/fakeRepository.js";
import { createFramework, addControlToFramework } from "../../Compliance/src/frameworkService.js";
import { createControl, mapObligationToControl } from "../../Compliance/src/controlService.js";
import { FakeRiskIntelligenceRepository } from "../../Risk-Intelligence/test/fakeRepository.js";
import type { NetworkRiskInsight, RiskAssessment } from "../../Risk-Intelligence/src/types.js";
import { FakeThreatIntelRepository } from "../../Threat-Intelligence/test/fakeRepository.js";
import { createThreatPattern, verifyThreatPattern } from "../../Threat-Intelligence/src/threatPatterns.js";
import { ingestVulnerabilities } from "../../Threat-Intelligence/src/vulnerabilityIngestion.js";
import { createStaffThreatActor } from "../../Threat-Intelligence/src/threatActorIngestion.js";
import { createStaffCampaign } from "../../Threat-Intelligence/src/campaignIngestion.js";
import type { Vulnerability } from "../../Threat-Intelligence/src/types.js";

function buildInsight(overrides: Partial<NetworkRiskInsight> = {}): NetworkRiskInsight {
  return {
    id: crypto.randomUUID(),
    industry: "Healthcare",
    type: "anomaly",
    severity: "critical",
    summary: "x",
    explanation: "x",
    contributingFactors: {},
    recommendation: "x",
    confidence: 0.8,
    linkedAggregateIds: [],
    isResolved: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    resolvedAt: null,
    ...overrides,
  };
}

function buildAssessment(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    id: crypto.randomUUID(),
    industry: "Healthcare",
    assessedAt: new Date("2026-01-01T00:00:00Z"),
    exposureScore: 50,
    exposureLevel: "medium",
    contributingInsightIds: [],
    ...overrides,
  };
}

function vulnInput(overrides: Partial<Vulnerability> = {}): Vulnerability {
  return {
    id: "",
    cveId: "CVE-2024-00001",
    vulnStatus: "Analyzed",
    description: "x",
    cvssVersion: "3.1",
    cvssBaseScore: 9.8,
    cvssBaseSeverity: "critical",
    cvssVectorString: "x",
    weaknesses: null,
    affectedProducts: null,
    referenceUrls: null,
    isKnownExploited: false,
    kevAddedAt: null,
    kevDueDate: null,
    kevRequiredAction: null,
    kevVulnerabilityName: null,
    publishedAt: new Date("2024-01-01T00:00:00Z"),
    lastModifiedAt: new Date("2024-01-01T00:00:00Z"),
    ingestedAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

test("getExecutiveDashboard returns all-zero/empty summaries against fresh, empty repositories -- not an error", async () => {
  const threatRepo = new FakeThreatIntelRepository();
  const complianceRepo = new FakeComplianceRepository();
  const riskRepo = new FakeRiskIntelligenceRepository();

  const dashboard = await getExecutiveDashboard(threatRepo, complianceRepo, riskRepo);

  assert.deepEqual(dashboard.threatActivity, {
    activePatterns: 0,
    patternsPendingVerification: 0,
    criticalVulnerabilities: 0,
    knownExploitedVulnerabilities: 0,
    activeThreatActors: 0,
    activeCampaigns: 0,
  });
  assert.equal(dashboard.complianceCoverage.frameworkCount, 0);
  assert.equal(dashboard.complianceCoverage.averageCoveragePercent, 0);
  assert.deepEqual(dashboard.industryRiskTrends, []);
  assert.equal(dashboard.businessImpact.unresolvedCriticalInsights, 0);
});

test("threat activity aggregates real counts across patterns, vulnerabilities, actors, and campaigns", async () => {
  const threatRepo = new FakeThreatIntelRepository();
  const complianceRepo = new FakeComplianceRepository();
  const riskRepo = new FakeRiskIntelligenceRepository();

  const pattern = await createThreatPattern(threatRepo, {
    patternId: "P-1",
    patternName: "x",
    threatType: "prompt_injection",
    severity: "high",
    description: "x",
    attackVector: "x",
    avgSeverityScore: 0.7,
    detectionSignature: {},
  });
  await verifyThreatPattern(threatRepo, pattern.id);
  await ingestVulnerabilities(threatRepo, [vulnInput({ cveId: "CVE-A", cvssBaseSeverity: "critical" })]);
  await ingestVulnerabilities(threatRepo, [vulnInput({ cveId: "CVE-B", cvssBaseSeverity: "medium", isKnownExploited: true })]);
  await createStaffThreatActor(threatRepo, { name: "Actor 1", description: "x" });
  await createStaffCampaign(threatRepo, { name: "Campaign 1", description: "x" });

  const dashboard = await getExecutiveDashboard(threatRepo, complianceRepo, riskRepo);

  assert.equal(dashboard.threatActivity.activePatterns, 1);
  assert.equal(dashboard.threatActivity.patternsPendingVerification, 0, "the one pattern was verified, so zero are pending");
  assert.equal(dashboard.threatActivity.criticalVulnerabilities, 1);
  assert.equal(dashboard.threatActivity.knownExploitedVulnerabilities, 1);
  assert.equal(dashboard.threatActivity.activeThreatActors, 1);
  assert.equal(dashboard.threatActivity.activeCampaigns, 1);
});

test("the actual point of computeFrameworkCoverage-based aggregation: coverage means 'has a mapped obligation,' not 'is satisfied' -- a required control with no obligation still counts against coverage", async () => {
  const threatRepo = new FakeThreatIntelRepository();
  const complianceRepo = new FakeComplianceRepository();
  const riskRepo = new FakeRiskIntelligenceRepository();

  const framework = await createFramework(complianceRepo, { key: "iso-42001", name: "ISO/IEC 42001:2023", description: "x" });
  const backed = await createControl(complianceRepo, { key: "ctrl-1", code: "CTRL-1", name: "x", description: "x" });
  const bareShell = await createControl(complianceRepo, { key: "ctrl-2", code: "CTRL-2", name: "x", description: "x" });
  await addControlToFramework(complianceRepo, framework.key, backed.key);
  await addControlToFramework(complianceRepo, framework.key, bareShell.key);
  await complianceRepo.replaceObligationsForUpdate("update-1", [
    {
      id: "obligation-1",
      updateId: "update-1",
      description: "x",
      obligationType: "disclosure",
      industries: [],
      deadlineDescription: null,
      deadlineDate: null,
      confidence: null,
      status: "pending_review",
      mergedIntoObligationId: null,
      createdAt: new Date(),
    },
  ]);
  await mapObligationToControl(complianceRepo, "obligation-1", backed.key);

  const dashboard = await getExecutiveDashboard(threatRepo, complianceRepo, riskRepo);

  assert.equal(dashboard.complianceCoverage.frameworkCount, 1);
  assert.equal(dashboard.complianceCoverage.perFramework[0]!.coveragePercent, 50, "1 of 2 required controls has a mapped obligation");
  assert.equal(dashboard.complianceCoverage.averageCoveragePercent, 50);
});

test("industry risk trends only include an industry that has BOTH an assessment and at least one insight -- a real behavioral nuance of listIndustriesWithInsights, not a bug", async () => {
  const threatRepo = new FakeThreatIntelRepository();
  const complianceRepo = new FakeComplianceRepository();
  const riskRepo = new FakeRiskIntelligenceRepository();

  await riskRepo.createInsight(buildInsight({ industry: "Healthcare" }));
  await riskRepo.createRiskAssessment(buildAssessment({ industry: "Healthcare", exposureScore: 75, exposureLevel: "high" }));

  await riskRepo.createRiskAssessment(buildAssessment({ industry: "Finance", exposureScore: 90, exposureLevel: "critical" }));

  const dashboard = await getExecutiveDashboard(threatRepo, complianceRepo, riskRepo);

  assert.equal(dashboard.industryRiskTrends.length, 1);
  assert.equal(dashboard.industryRiskTrends[0]!.industry, "Healthcare");
});

test("industry risk trends are sorted by latest exposure score descending, and include history for a trend line", async () => {
  const threatRepo = new FakeThreatIntelRepository();
  const complianceRepo = new FakeComplianceRepository();
  const riskRepo = new FakeRiskIntelligenceRepository();

  await riskRepo.createInsight(buildInsight({ industry: "Healthcare" }));
  await riskRepo.createRiskAssessment(buildAssessment({ industry: "Healthcare", exposureScore: 30, assessedAt: new Date("2026-01-01T00:00:00Z") }));
  await riskRepo.createRiskAssessment(buildAssessment({ industry: "Healthcare", exposureScore: 40, assessedAt: new Date("2026-02-01T00:00:00Z") }));

  await riskRepo.createInsight(buildInsight({ industry: "Finance" }));
  await riskRepo.createRiskAssessment(buildAssessment({ industry: "Finance", exposureScore: 90, assessedAt: new Date("2026-01-15T00:00:00Z") }));

  const dashboard = await getExecutiveDashboard(threatRepo, complianceRepo, riskRepo);

  assert.equal(dashboard.industryRiskTrends.length, 2);
  assert.equal(dashboard.industryRiskTrends[0]!.industry, "Finance", "higher latest exposure score sorts first");
  assert.equal(dashboard.industryRiskTrends[1]!.industry, "Healthcare");
  assert.equal(dashboard.industryRiskTrends[1]!.latestExposureScore, 40, "the most recent snapshot, not the first one created");
  assert.equal(dashboard.industryRiskTrends[1]!.history.length, 2, "both snapshots included for the trend line");
  assert.equal(dashboard.industryRiskTrends[1]!.history[0]!.exposureScore, 30, "history is oldest-first for a trend line, not newest-first");
});

test("business impact counts unresolved critical and high insights separately, excludes resolved ones", async () => {
  const threatRepo = new FakeThreatIntelRepository();
  const complianceRepo = new FakeComplianceRepository();
  const riskRepo = new FakeRiskIntelligenceRepository();

  await riskRepo.createInsight(buildInsight({ severity: "critical", isResolved: false }));
  await riskRepo.createInsight(buildInsight({ severity: "critical", isResolved: false }));
  await riskRepo.createInsight(buildInsight({ severity: "critical", isResolved: true }));
  await riskRepo.createInsight(buildInsight({ severity: "high", isResolved: false }));

  const dashboard = await getExecutiveDashboard(threatRepo, complianceRepo, riskRepo);

  assert.equal(dashboard.businessImpact.unresolvedCriticalInsights, 2);
  assert.equal(dashboard.businessImpact.unresolvedHighInsights, 1);
  assert.equal(dashboard.businessImpact.recentCriticalInsights.length, 2);
});
