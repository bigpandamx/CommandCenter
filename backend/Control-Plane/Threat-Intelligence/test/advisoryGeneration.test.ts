import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAdvisoryFromPattern,
  generateAndPublishThreatAdvisory,
  ThreatAdvisoryError,
} from "../src/advisoryGeneration.js";
import { createThreatPattern, markThreatPatternFalsePositive, setThreatPatternActive, verifyThreatPattern } from "../src/threatPatterns.js";
import { FakeThreatIntelRepository } from "./fakeRepository.js";
import { FakeAnnouncementsRepository } from "../../Announcements/test/fakeRepository.js";

function patternInput(overrides: Partial<Parameters<typeof createThreatPattern>[1]> = {}) {
  return {
    patternId: overrides.patternId ?? "THREAT-2026-001",
    patternName: "Instruction Override Attempt",
    threatType: "prompt_injection" as const,
    severity: "high" as const,
    description: "An attacker embeds hidden instructions in user-supplied content.",
    attackVector: "Untrusted document content processed by an LLM.",
    detectionSignature: {},
    avgSeverityScore: 0.75,
    ...overrides,
  };
}

// --- buildAdvisoryFromPattern (pure) ---

test("buildAdvisoryFromPattern rejects a pattern that hasn't been verified by an analyst", () => {
  const pattern = {
    id: "p1",
    patternId: "THREAT-2026-001",
    patternName: "Test",
    threatType: "prompt_injection" as const,
    severity: "high" as const,
    description: "d",
    attackVector: "v",
    indicatorsOfCompromise: null,
    detectionSignature: {},
    confidenceThreshold: 0.5,
    firstObserved: new Date(),
    lastObserved: new Date(),
    totalObservations: 1,
    affectedOrganizationsCount: 1,
    affectedIndustries: null,
    avgSeverityScore: 0.75,
    successRate: null,
    estimatedPrevalence: null,
    mitigationSteps: null,
    remediationGuidance: null,
    isActive: true,
    isFalsePositive: false,
    verifiedByAnalyst: false,
    externalReferences: null,
    relatedPatternIds: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  assert.throws(
    () => buildAdvisoryFromPattern(pattern),
    (err: unknown) => err instanceof ThreatAdvisoryError && err.code === "not_eligible",
  );
});

test("buildAdvisoryFromPattern maps ThreatSeverity to AnnouncementSeverity correctly, including the high/medium collapse", async () => {
  const repo = new FakeThreatIntelRepository();
  const critical = await createThreatPattern(repo, patternInput({ patternId: "A", severity: "critical" }));
  const high = await createThreatPattern(repo, patternInput({ patternId: "B", severity: "high" }));
  const medium = await createThreatPattern(repo, patternInput({ patternId: "C", severity: "medium" }));
  const low = await createThreatPattern(repo, patternInput({ patternId: "D", severity: "low" }));
  for (const p of [critical, high, medium, low]) {
    await verifyThreatPattern(repo, p.id);
  }
  const verifiedCritical = (await repo.getPatternById(critical.id))!;
  const verifiedHigh = (await repo.getPatternById(high.id))!;
  const verifiedMedium = (await repo.getPatternById(medium.id))!;
  const verifiedLow = (await repo.getPatternById(low.id))!;

  assert.equal(buildAdvisoryFromPattern(verifiedCritical).severity, "critical");
  assert.equal(buildAdvisoryFromPattern(verifiedHigh).severity, "warning");
  assert.equal(buildAdvisoryFromPattern(verifiedMedium).severity, "warning");
  assert.equal(buildAdvisoryFromPattern(verifiedLow).severity, "info");
});

test("buildAdvisoryFromPattern is always a broadcast -- organizationId is always null, no per-org targeting attempted", async () => {
  const repo = new FakeThreatIntelRepository();
  const pattern = await createThreatPattern(repo, patternInput());
  await verifyThreatPattern(repo, pattern.id);
  const verified = (await repo.getPatternById(pattern.id))!;

  const item = buildAdvisoryFromPattern(verified);

  assert.equal(item.organizationId, null);
  assert.equal(item.audience, "customers");
});

test("buildAdvisoryFromPattern's body includes affected industries when known, and indicators of compromise", async () => {
  const repo = new FakeThreatIntelRepository();
  const pattern = await createThreatPattern(
    repo,
    patternInput({ affectedIndustries: ["healthcare", "finance"], indicatorsOfCompromise: ["suspicious header X"] }),
  );
  await verifyThreatPattern(repo, pattern.id);
  const verified = (await repo.getPatternById(pattern.id))!;

  const item = buildAdvisoryFromPattern(verified);

  assert.ok(item.body.includes("healthcare"));
  assert.ok(item.body.includes("suspicious header X"));
});

// --- generateAndPublishThreatAdvisory ---

test("generateAndPublishThreatAdvisory creates a draft announcement from a verified pattern", async () => {
  const threatIntelRepo = new FakeThreatIntelRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  const pattern = await createThreatPattern(threatIntelRepo, patternInput());
  await verifyThreatPattern(threatIntelRepo, pattern.id);

  const announcement = await generateAndPublishThreatAdvisory(threatIntelRepo, announcementsRepo, pattern.id, "staff-1");

  assert.equal(announcement.status, "draft");
  assert.ok(announcement.title.includes("Instruction Override Attempt"));
  assert.equal(announcement.createdByStaffId, "staff-1");
});

test("generateAndPublishThreatAdvisory throws not_eligible for an unverified pattern, and creates nothing", async () => {
  const threatIntelRepo = new FakeThreatIntelRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  const pattern = await createThreatPattern(threatIntelRepo, patternInput());
  // Not verified.

  await assert.rejects(
    () => generateAndPublishThreatAdvisory(threatIntelRepo, announcementsRepo, pattern.id, "staff-1"),
    (err: unknown) => err instanceof ThreatAdvisoryError && err.code === "not_eligible",
  );
  const announcements = await announcementsRepo.searchAnnouncements({});
  assert.equal(announcements.length, 0);
});

test("generateAndPublishThreatAdvisory throws not_eligible for a pattern marked as a false positive, even if verified", async () => {
  const threatIntelRepo = new FakeThreatIntelRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  const pattern = await createThreatPattern(threatIntelRepo, patternInput());
  await verifyThreatPattern(threatIntelRepo, pattern.id);
  await markThreatPatternFalsePositive(threatIntelRepo, pattern.id);

  await assert.rejects(
    () => generateAndPublishThreatAdvisory(threatIntelRepo, announcementsRepo, pattern.id, "staff-1"),
    (err: unknown) => err instanceof ThreatAdvisoryError && err.code === "not_eligible",
  );
});

test("generateAndPublishThreatAdvisory throws not_eligible for a deactivated pattern, even if verified", async () => {
  const threatIntelRepo = new FakeThreatIntelRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  const pattern = await createThreatPattern(threatIntelRepo, patternInput());
  await verifyThreatPattern(threatIntelRepo, pattern.id);
  await setThreatPatternActive(threatIntelRepo, pattern.id, false);

  await assert.rejects(
    () => generateAndPublishThreatAdvisory(threatIntelRepo, announcementsRepo, pattern.id, "staff-1"),
    (err: unknown) => err instanceof ThreatAdvisoryError && err.code === "not_eligible",
  );
});

test("generateAndPublishThreatAdvisory throws pattern_not_found for an unknown pattern id", async () => {
  const threatIntelRepo = new FakeThreatIntelRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();

  await assert.rejects(
    () => generateAndPublishThreatAdvisory(threatIntelRepo, announcementsRepo, "ghost-pattern", "staff-1"),
    (err: unknown) => err instanceof ThreatAdvisoryError && err.code === "pattern_not_found",
  );
});
