import { test } from "node:test";
import assert from "node:assert/strict";
import { createThreatPattern, markThreatPatternFalsePositive, setThreatPatternActive } from "../src/threatPatterns.js";
import { createPromptAbuseSignature, setSignatureActive } from "../src/promptSignatures.js";
import { createStaffThreatActor, setThreatActorActive } from "../src/threatActorIngestion.js";
import { ingestVulnerabilities } from "../src/vulnerabilityIngestion.js";
import { getPatternsForDistribution, getSignaturesForDistribution, getVulnerabilitiesForDistribution, getThreatActorsForDistribution } from "../src/distribution.js";
import type { Vulnerability } from "../src/types.js";
import { FakeThreatIntelRepository } from "./fakeRepository.js";

function patternInput(overrides: Partial<Parameters<typeof createThreatPattern>[1]> = {}) {
  return {
    patternId: overrides.patternId ?? "THREAT-2026-001",
    patternName: "Instruction Override Attempt",
    threatType: "prompt_injection" as const,
    severity: "high" as const,
    description: "desc",
    attackVector: "vector",
    detectionSignature: {},
    avgSeverityScore: 0.75,
    ...overrides,
  };
}

test("getPatternsForDistribution includes active patterns", async () => {
  const repo = new FakeThreatIntelRepository();
  await createThreatPattern(repo, patternInput());
  const results = await getPatternsForDistribution(repo);
  assert.equal(results.length, 1);
});

test("getPatternsForDistribution excludes deactivated patterns", async () => {
  const repo = new FakeThreatIntelRepository();
  const pattern = await createThreatPattern(repo, patternInput());
  await setThreatPatternActive(repo, pattern.id, false);
  const results = await getPatternsForDistribution(repo);
  assert.equal(results.length, 0);
});

test("getPatternsForDistribution excludes false positives even if somehow still marked active", async () => {
  const repo = new FakeThreatIntelRepository();
  const pattern = await createThreatPattern(repo, patternInput());
  await markThreatPatternFalsePositive(repo, pattern.id); // this also sets isActive=false in the real flow
  // Force the pathological state (active=true AND false positive) directly
  // via the repo to make sure distribution's own filter -- not just
  // markThreatPatternFalsePositive's side effect -- is what's doing the
  // excluding here.
  const stored = await repo.getPatternById(pattern.id);
  await repo.updatePattern({ ...stored!, isActive: true, isFalsePositive: true });

  const results = await getPatternsForDistribution(repo);
  assert.equal(results.length, 0, "a false positive must never be distributed, regardless of isActive");
});

test("getPatternsForDistribution respects the since cursor for incremental sync", async () => {
  const repo = new FakeThreatIntelRepository();
  await createThreatPattern(repo, patternInput({ patternId: "THREAT-OLD" }), new Date("2026-01-01T00:00:00Z"));
  await createThreatPattern(repo, patternInput({ patternId: "THREAT-NEW" }), new Date("2026-07-01T00:00:00Z"));

  const results = await getPatternsForDistribution(repo, { since: new Date("2026-06-01T00:00:00Z") });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.patternId, "THREAT-NEW");
});

test("getPatternsForDistribution with no since cursor returns everything active", async () => {
  const repo = new FakeThreatIntelRepository();
  await createThreatPattern(repo, patternInput({ patternId: "A" }), new Date("2020-01-01T00:00:00Z"));
  await createThreatPattern(repo, patternInput({ patternId: "B" }), new Date("2026-01-01T00:00:00Z"));
  const results = await getPatternsForDistribution(repo);
  assert.equal(results.length, 2);
});

test("getSignaturesForDistribution includes active signatures and excludes deactivated ones", async () => {
  const repo = new FakeThreatIntelRepository();
  const active = await createPromptAbuseSignature(repo, {
    signatureId: "PROMPT-A",
    signatureName: "Active One",
    category: "injection",
    detectionLogic: {},
    severity: "medium",
    riskScore: 0.5,
  });
  const inactive = await createPromptAbuseSignature(repo, {
    signatureId: "PROMPT-B",
    signatureName: "Inactive One",
    category: "injection",
    detectionLogic: {},
    severity: "medium",
    riskScore: 0.5,
  });
  await setSignatureActive(repo, inactive.id, false);

  const results = await getSignaturesForDistribution(repo);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.id, active.id);
});

test("getSignaturesForDistribution respects the since cursor", async () => {
  const repo = new FakeThreatIntelRepository();
  await createPromptAbuseSignature(
    repo,
    { signatureId: "OLD", signatureName: "Old", category: "injection", detectionLogic: {}, severity: "low", riskScore: 0.3 },
    new Date("2026-01-01T00:00:00Z"),
  );
  await createPromptAbuseSignature(
    repo,
    { signatureId: "NEW", signatureName: "New", category: "injection", detectionLogic: {}, severity: "low", riskScore: 0.3 },
    new Date("2026-07-01T00:00:00Z"),
  );

  const results = await getSignaturesForDistribution(repo, { since: new Date("2026-06-01T00:00:00Z") });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.signatureId, "NEW");
});

function vulnInput(overrides: Partial<Vulnerability> = {}): Vulnerability {
  return {
    id: "",
    cveId: "CVE-2024-00001",
    vulnStatus: "Analyzed",
    description: "x",
    cvssVersion: "3.1",
    cvssBaseScore: 7.5,
    cvssBaseSeverity: "high",
    cvssVectorString: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
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

test("getVulnerabilitiesForDistribution returns everything -- no isActive/isFalsePositive concept exists for a CVE", async () => {
  const repo = new FakeThreatIntelRepository();
  await ingestVulnerabilities(repo, [vulnInput({ cveId: "CVE-A" }), vulnInput({ cveId: "CVE-B" })]);

  const results = await getVulnerabilitiesForDistribution(repo);
  assert.equal(results.length, 2);
});

test("getVulnerabilitiesForDistribution respects the since cursor for incremental sync", async () => {
  const repo = new FakeThreatIntelRepository();
  await ingestVulnerabilities(repo, [vulnInput({ cveId: "CVE-OLD", lastModifiedAt: new Date("2026-01-01T00:00:00Z") })]);
  await ingestVulnerabilities(repo, [vulnInput({ cveId: "CVE-NEW", lastModifiedAt: new Date("2026-07-01T00:00:00Z") })]);

  const results = await getVulnerabilitiesForDistribution(repo, { since: new Date("2026-06-01T00:00:00Z") });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.cveId, "CVE-NEW");
});

test("getThreatActorsForDistribution includes active actors and excludes inactive ones", async () => {
  const repo = new FakeThreatIntelRepository();
  const active = await createStaffThreatActor(repo, { name: "Active Group", description: "x" });
  const inactive = await createStaffThreatActor(repo, { name: "Inactive Group", description: "x" });
  await setThreatActorActive(repo, inactive.id, false);

  const results = await getThreatActorsForDistribution(repo);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.id, active.id);
});

test("getThreatActorsForDistribution respects the since cursor", async () => {
  const repo = new FakeThreatIntelRepository();
  await createStaffThreatActor(repo, { name: "Old Group", description: "x" }, new Date("2026-01-01T00:00:00Z"));
  await createStaffThreatActor(repo, { name: "New Group", description: "x" }, new Date("2026-07-01T00:00:00Z"));

  const results = await getThreatActorsForDistribution(repo, { since: new Date("2026-06-01T00:00:00Z") });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.name, "New Group");
});
