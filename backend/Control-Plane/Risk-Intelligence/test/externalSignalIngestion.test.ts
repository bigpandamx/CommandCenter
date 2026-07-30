import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CROSS_INDUSTRY,
  buildInsightFromVulnerability,
  generateInsightsFromVulnerabilities,
  buildInsightFromCampaign,
  generateInsightsFromCampaigns,
  buildInsightsFromObligation,
  generateInsightsFromComplianceObligations,
} from "../src/externalSignalIngestion.js";
import { FakeRiskIntelligenceRepository } from "./fakeRepository.js";
import { FakeThreatIntelRepository } from "../../Threat-Intelligence/test/fakeRepository.js";
import { FakeComplianceRepository } from "../../Compliance/test/fakeRepository.js";
import type { Campaign, Vulnerability } from "../../Threat-Intelligence/src/types.js";
import type { ComplianceObligation, ComplianceUpdate } from "../../Compliance/src/types.js";

function buildComplianceUpdate(overrides: Partial<ComplianceUpdate> = {}): ComplianceUpdate {
  return {
    id: randomUUID(),
    sourceId: randomUUID(),
    externalId: `ext-${Math.floor(Math.random() * 100000)}`,
    documentType: "new_law",
    country: "US",
    state: null,
    industries: [],
    title: "Test Compliance Update",
    summary: "A test summary.",
    content: null,
    url: "https://example.gov/doc",
    frameworkTags: [],
    publishedAt: new Date(),
    effectiveDate: null,
    ingestedAt: new Date(),
    ruleId: null,
    status: "new",
    ...overrides,
  };
}

function buildVuln(overrides: Partial<Vulnerability> = {}): Vulnerability {
  return {
    id: randomUUID(),
    cveId: `CVE-2026-${Math.floor(Math.random() * 100000)}`,
    vulnStatus: "Analyzed",
    description: "A test vulnerability description.",
    cvssVersion: "3.1",
    cvssBaseScore: 5.0,
    cvssBaseSeverity: "medium",
    cvssVectorString: null,
    weaknesses: null,
    affectedProducts: null,
    referenceUrls: null,
    isKnownExploited: false,
    kevAddedAt: null,
    kevDueDate: null,
    kevRequiredAction: null,
    kevVulnerabilityName: null,
    publishedAt: new Date(),
    lastModifiedAt: new Date(),
    ingestedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// --- buildInsightFromVulnerability (pure eligibility + construction) ---

test("buildInsightFromVulnerability returns null for a non-critical, non-exploited vulnerability", () => {
  const vuln = buildVuln({ cvssBaseSeverity: "medium", isKnownExploited: false });
  assert.equal(buildInsightFromVulnerability(vuln), null);
});

test("buildInsightFromVulnerability returns null even for high severity, if not known-exploited", () => {
  const vuln = buildVuln({ cvssBaseSeverity: "high", isKnownExploited: false });
  assert.equal(buildInsightFromVulnerability(vuln), null);
});

test("buildInsightFromVulnerability produces an insight for critical severity", () => {
  const vuln = buildVuln({ cvssBaseSeverity: "critical", cvssBaseScore: 9.8 });
  const insight = buildInsightFromVulnerability(vuln);
  assert.ok(insight);
  assert.equal(insight?.severity, "critical");
  assert.equal(insight?.type, "external_signal");
});

test("buildInsightFromVulnerability produces an insight for known-exploited, even at lower CVSS severity", () => {
  const vuln = buildVuln({ cvssBaseSeverity: "medium", isKnownExploited: true, kevDueDate: new Date("2026-08-01") });
  const insight = buildInsightFromVulnerability(vuln);
  assert.ok(insight);
  assert.equal(insight?.severity, "critical", "known-exploited always maps to critical severity, regardless of the CVSS band");
});

test("buildInsightFromVulnerability sets industry to the cross-industry sentinel, not a guess", () => {
  const vuln = buildVuln({ cvssBaseSeverity: "critical" });
  const insight = buildInsightFromVulnerability(vuln);
  assert.equal(insight?.industry, CROSS_INDUSTRY);
});

test("buildInsightFromVulnerability always sets confidence to 1.0 -- a pass-through of NVD/CISA's own classification, not a probabilistic detection", () => {
  const vuln = buildVuln({ cvssBaseSeverity: "critical" });
  const insight = buildInsightFromVulnerability(vuln);
  assert.equal(insight?.confidence, 1.0);
});

test("buildInsightFromVulnerability's contributingFactors trace back to the specific CVE", () => {
  const vuln = buildVuln({ cveId: "CVE-2026-99999", cvssBaseSeverity: "critical" });
  const insight = buildInsightFromVulnerability(vuln);
  assert.equal((insight?.contributingFactors as { cveId: string }).cveId, "CVE-2026-99999");
  assert.equal((insight?.contributingFactors as { source: string }).source, "nvd_cve");
});

// --- generateInsightsFromVulnerabilities (the orchestration) ---

test("generateInsightsFromVulnerabilities creates one insight per significant, distinct CVE", async () => {
  const threatIntelRepo = new FakeThreatIntelRepository();
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  await threatIntelRepo.createVulnerability(buildVuln({ cveId: "CVE-2026-00001", cvssBaseSeverity: "critical" }));
  await threatIntelRepo.createVulnerability(buildVuln({ cveId: "CVE-2026-00002", cvssBaseSeverity: "medium", isKnownExploited: false }));

  const result = await generateInsightsFromVulnerabilities(threatIntelRepo, riskIntelRepo);

  assert.equal(result.created.length, 1);
  assert.equal(result.failed.length, 0);
});

test("generateInsightsFromVulnerabilities de-duplicates a CVE that is both critical AND known-exploited -- it must not create two insights for the same CVE", async () => {
  const threatIntelRepo = new FakeThreatIntelRepository();
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  await threatIntelRepo.createVulnerability(buildVuln({ cveId: "CVE-2026-00001", cvssBaseSeverity: "critical", isKnownExploited: true }));

  const result = await generateInsightsFromVulnerabilities(threatIntelRepo, riskIntelRepo);

  assert.equal(result.created.length, 1, "a CVE matching both the critical-severity query and the known-exploited query must only produce one insight");
});

test("generateInsightsFromVulnerabilities only processes vulnerabilities modified since the last run -- the cursor genuinely advances", async () => {
  const threatIntelRepo = new FakeThreatIntelRepository();
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  const firstRunTime = new Date("2026-07-01T00:00:00Z");
  await threatIntelRepo.createVulnerability(
    buildVuln({ cveId: "CVE-2026-00001", cvssBaseSeverity: "critical", lastModifiedAt: new Date("2026-06-15T00:00:00Z") }),
  );

  const firstRun = await generateInsightsFromVulnerabilities(threatIntelRepo, riskIntelRepo, firstRunTime);
  assert.equal(firstRun.created.length, 1);

  // A second run, with no new vulnerabilities added, should create nothing more --
  // the cursor (most recent external_signal insight's createdAt) has advanced past
  // this CVE's own lastModifiedAt.
  const secondRun = await generateInsightsFromVulnerabilities(threatIntelRepo, riskIntelRepo, new Date("2026-07-02T00:00:00Z"));
  assert.equal(secondRun.created.length, 0, "the same CVE should not be re-processed once the cursor has moved past it");
});

test("generateInsightsFromVulnerabilities returns an empty result, not an error, when nothing is significant", async () => {
  const threatIntelRepo = new FakeThreatIntelRepository();
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  await threatIntelRepo.createVulnerability(buildVuln({ cvssBaseSeverity: "low", isKnownExploited: false }));

  const result = await generateInsightsFromVulnerabilities(threatIntelRepo, riskIntelRepo);

  assert.deepEqual(result.created, []);
  assert.deepEqual(result.failed, []);
});

// --- The real dedup fix: per-entity check, not just the cursor ---

test("generateInsightsFromVulnerabilities does not re-create an insight for a CVE it has already reported, even if the cursor would have re-matched it (NVD touching lastModifiedAt without changing severity)", async () => {
  const threatIntelRepo = new FakeThreatIntelRepository();
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  const vuln = buildVuln({ cveId: "CVE-2026-00001", cvssBaseSeverity: "critical", lastModifiedAt: new Date("2026-07-01T00:00:00Z") });
  await threatIntelRepo.createVulnerability(vuln);
  await generateInsightsFromVulnerabilities(threatIntelRepo, riskIntelRepo, new Date("2026-07-01T01:00:00Z"));

  // Simulate NVD touching lastModifiedAt again (e.g. adding a reference URL) without
  // changing severity -- a cursor-only approach would re-match this.
  await threatIntelRepo.createVulnerability({ ...vuln, lastModifiedAt: new Date("2026-07-02T00:00:00Z") });

  const secondRun = await generateInsightsFromVulnerabilities(threatIntelRepo, riskIntelRepo, new Date("2026-07-02T01:00:00Z"));

  assert.equal(secondRun.created.length, 0, "the per-entity dedup check must catch this even when the cursor alone would have re-matched the CVE");
});

// --- Campaigns: buildInsightFromCampaign (pure) ---

function buildCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: randomUUID(),
    mitreCampaignId: "C0001",
    name: "Test Campaign",
    aliases: null,
    description: "A test campaign description.",
    source: "mitre_attack",
    firstSeen: new Date("2026-01-01"),
    lastSeen: new Date("2026-06-01"),
    attributedActorIds: null,
    originCountry: null,
    targetedCountries: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test("buildInsightFromCampaign returns null for an inactive campaign", () => {
  const campaign = buildCampaign({ isActive: false });
  assert.equal(buildInsightFromCampaign(campaign), null);
});

test("buildInsightFromCampaign produces an insight for an active campaign, with severity 'high' -- a deliberate, stated, uniform choice, not derived from anything", () => {
  const campaign = buildCampaign({ isActive: true });
  const insight = buildInsightFromCampaign(campaign);
  assert.ok(insight);
  assert.equal(insight?.severity, "high");
  assert.equal(insight?.type, "external_signal");
});

test("buildInsightFromCampaign notes attribution status in the explanation", () => {
  const attributed = buildInsightFromCampaign(buildCampaign({ attributedActorIds: ["actor-1", "actor-2"] }));
  const unattributed = buildInsightFromCampaign(buildCampaign({ attributedActorIds: null }));

  assert.ok(attributed?.explanation.includes("2 known threat actor"));
  assert.ok(unattributed?.explanation.includes("Not yet attributed"));
});

test("buildInsightFromCampaign always sets confidence to 1.0 -- Command Center's own confirmed record of active status, not a probabilistic guess", () => {
  const insight = buildInsightFromCampaign(buildCampaign());
  assert.equal(insight?.confidence, 1.0);
});

// --- generateInsightsFromCampaigns: the real reason the dedup fix exists ---

test("generateInsightsFromCampaigns creates one insight for a newly-active campaign", async () => {
  const threatIntelRepo = new FakeThreatIntelRepository();
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  await threatIntelRepo.createCampaign(buildCampaign({ mitreCampaignId: "C0001", isActive: true }));

  const result = await generateInsightsFromCampaigns(threatIntelRepo, riskIntelRepo);

  assert.equal(result.created.length, 1);
});

test("generateInsightsFromCampaigns does NOT re-generate an insight for a still-active campaign whose updatedAt was bumped by an unrelated re-sync -- the actual scenario this whole dedup mechanism exists for", async () => {
  const threatIntelRepo = new FakeThreatIntelRepository();
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  const campaign = buildCampaign({ mitreCampaignId: "C0001", isActive: true, updatedAt: new Date("2026-07-01T00:00:00Z") });
  await threatIntelRepo.createCampaign(campaign);
  await generateInsightsFromCampaigns(threatIntelRepo, riskIntelRepo, new Date("2026-07-01T01:00:00Z"));

  // Simulate campaignIngestion.ts's own unconditional updatedAt bump on re-sync,
  // with genuinely nothing else about the campaign having changed.
  await threatIntelRepo.updateCampaign({ ...campaign, updatedAt: new Date("2026-07-02T00:00:00Z") });

  const secondRun = await generateInsightsFromCampaigns(threatIntelRepo, riskIntelRepo, new Date("2026-07-02T01:00:00Z"));

  assert.equal(secondRun.created.length, 0, "a still-active campaign with no meaningful change must not produce a second insight just because updatedAt moved");
});

test("generateInsightsFromCampaigns does not touch inactive campaigns", async () => {
  const threatIntelRepo = new FakeThreatIntelRepository();
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  await threatIntelRepo.createCampaign(buildCampaign({ mitreCampaignId: "C0001", isActive: false }));

  const result = await generateInsightsFromCampaigns(threatIntelRepo, riskIntelRepo);

  assert.deepEqual(result.created, []);
});

test("generateInsightsFromCampaigns creates separate insights for two distinct active campaigns", async () => {
  const threatIntelRepo = new FakeThreatIntelRepository();
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  await threatIntelRepo.createCampaign(buildCampaign({ mitreCampaignId: "C0001", name: "Campaign One", isActive: true }));
  await threatIntelRepo.createCampaign(buildCampaign({ mitreCampaignId: "C0002", name: "Campaign Two", isActive: true }));

  const result = await generateInsightsFromCampaigns(threatIntelRepo, riskIntelRepo);

  assert.equal(result.created.length, 2);
});

// --- Compliance obligations: buildInsightsFromObligation (pure) ---

function buildObligation(overrides: Partial<ComplianceObligation> = {}): ComplianceObligation {
  return {
    id: randomUUID(),
    updateId: randomUUID(),
    description: "A test compliance obligation.",
    obligationType: "reporting",
    industries: [],
    deadlineDescription: "within 90 days",
    deadlineDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // 20 days out
    confidence: 85,
    status: "approved",
    mergedIntoObligationId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

test("buildInsightsFromObligation returns nothing for a pending_review obligation -- only staff-approved obligations are eligible", () => {
  const obligation = buildObligation({ status: "pending_review" });
  assert.deepEqual(buildInsightsFromObligation(obligation, "Test Update"), []);
});

test("buildInsightsFromObligation returns nothing for an obligation with no deadline", () => {
  const obligation = buildObligation({ deadlineDate: null });
  assert.deepEqual(buildInsightsFromObligation(obligation, "Test Update"), []);
});

test("buildInsightsFromObligation returns nothing for a deadline already in the past", () => {
  const obligation = buildObligation({ deadlineDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) });
  assert.deepEqual(buildInsightsFromObligation(obligation, "Test Update"), []);
});

test("buildInsightsFromObligation returns nothing for a deadline further out than the 90-day window", () => {
  const obligation = buildObligation({ deadlineDate: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000) });
  assert.deepEqual(buildInsightsFromObligation(obligation, "Test Update"), []);
});

test("buildInsightsFromObligation produces 'critical' severity within 30 days, 'high' between 30 and 90", () => {
  const soon = buildObligation({ deadlineDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) });
  const later = buildObligation({ deadlineDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) });

  assert.equal(buildInsightsFromObligation(soon, "x")[0]?.severity, "critical");
  assert.equal(buildInsightsFromObligation(later, "x")[0]?.severity, "high");
});

test("buildInsightsFromObligation always sets confidence to 1.0 -- staff approval supersedes the original AI extraction confidence", () => {
  const obligation = buildObligation({ confidence: 40 }); // deliberately low original AI confidence
  const insights = buildInsightsFromObligation(obligation, "x");
  assert.equal(insights[0]?.confidence, 1.0);
  assert.equal((insights[0]?.contributingFactors as { originalExtractionConfidence: number }).originalExtractionConfidence, 40, "the original AI confidence is preserved for traceability, just not used as the insight's own confidence");
});

// --- The genuine improvement over CVE/campaign: real industry fan-out ---

test("buildInsightsFromObligation produces one insight PER industry when the obligation applies to several", () => {
  const obligation = buildObligation({ industries: ["healthcare", "financial-services"] });
  const insights = buildInsightsFromObligation(obligation, "x");

  assert.equal(insights.length, 2);
  assert.deepEqual(new Set(insights.map((i) => i.industry)), new Set(["healthcare", "financial-services"]));
});

test("buildInsightsFromObligation falls back to the cross-industry sentinel only when industries is genuinely empty", () => {
  const obligation = buildObligation({ industries: [] });
  const insights = buildInsightsFromObligation(obligation, "x");

  assert.equal(insights.length, 1);
  assert.equal(insights[0]?.industry, CROSS_INDUSTRY);
});

test("buildInsightsFromObligation's sourceReferenceId is always formatted as obligationId:industry, even for a single industry -- a stable dedup key regardless of how many industries exist", () => {
  const single = buildObligation({ id: "obligation-1", industries: ["healthcare"] });
  const insights = buildInsightsFromObligation(single, "x");

  assert.equal((insights[0]?.contributingFactors as { sourceReferenceId: string }).sourceReferenceId, "obligation-1:healthcare");
});

// --- generateInsightsFromComplianceObligations (the orchestration) ---

test("generateInsightsFromComplianceObligations creates one insight per industry for an eligible, multi-industry obligation", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  const update = buildComplianceUpdate({ title: "New AI Transparency Rule" });
  await complianceRepo.appendUpdate(update);
  const obligation = buildObligation({ updateId: update.id, industries: ["healthcare", "financial-services"] });
  await complianceRepo.replaceObligationsForUpdate(update.id, [obligation]);

  const result = await generateInsightsFromComplianceObligations(complianceRepo, riskIntelRepo);

  assert.equal(result.created.length, 2);
  assert.ok(result.created.every((i) => i.summary.includes("New AI Transparency Rule")));
});

test("generateInsightsFromComplianceObligations skips a pending_review obligation entirely", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  const update = buildComplianceUpdate();
  await complianceRepo.appendUpdate(update);
  await complianceRepo.replaceObligationsForUpdate(update.id, [buildObligation({ updateId: update.id, status: "pending_review" })]);

  const result = await generateInsightsFromComplianceObligations(complianceRepo, riskIntelRepo);

  assert.deepEqual(result.created, []);
});

test("generateInsightsFromComplianceObligations does not re-create an insight for an obligation/industry pair already reported", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  const update = buildComplianceUpdate();
  await complianceRepo.appendUpdate(update);
  await complianceRepo.replaceObligationsForUpdate(update.id, [buildObligation({ updateId: update.id, industries: ["healthcare"] })]);

  await generateInsightsFromComplianceObligations(complianceRepo, riskIntelRepo);
  const secondRun = await generateInsightsFromComplianceObligations(complianceRepo, riskIntelRepo);

  assert.deepEqual(secondRun.created, [], "re-running with no change to the obligation must not produce a duplicate insight");
});

test("generateInsightsFromComplianceObligations handles a missing parent update gracefully, without failing the whole batch", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const riskIntelRepo = new FakeRiskIntelligenceRepository();
  // Obligation referencing an update that was never appended.
  await complianceRepo.replaceObligationsForUpdate("ghost-update", [buildObligation({ updateId: "ghost-update" })]);

  const result = await generateInsightsFromComplianceObligations(complianceRepo, riskIntelRepo);

  assert.equal(result.created.length, 1);
  assert.ok(result.created[0]?.summary.includes("source document unavailable"));
});
