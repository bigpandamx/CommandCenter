import { test } from "node:test";
import assert from "node:assert/strict";
import { createThreatPattern } from "../src/threatPatterns.js";
import { setConsent, revokeConsent } from "../src/consent.js";
import { reportThreatObservation } from "../src/observations.js";
import { FakeThreatIntelRepository } from "./fakeRepository.js";

const SALT = "test-salt";

async function seedPattern(repo: FakeThreatIntelRepository, avgSeverityScore = 0.5) {
  return createThreatPattern(repo, {
    patternId: "THREAT-2026-001",
    patternName: "Instruction Override Attempt",
    threatType: "prompt_injection",
    severity: "high",
    description: "desc",
    attackVector: "vector",
    detectionSignature: {},
    avgSeverityScore,
  });
}

test("reportThreatObservation is rejected when the org has never set consent", async () => {
  const repo = new FakeThreatIntelRepository();
  await seedPattern(repo);

  const result = await reportThreatObservation(
    repo,
    { organizationId: "org-1", patternId: "THREAT-2026-001", severityScore: 0.8 },
    SALT,
  );

  assert.deepEqual(result, { accepted: false, reason: "no_consent" });
  assert.equal(repo.observations.length, 0, "nothing should be stored without consent");
});

test("reportThreatObservation is rejected when the org has consented but not to shareThreatPatterns specifically", async () => {
  const repo = new FakeThreatIntelRepository();
  await seedPattern(repo);
  await setConsent(repo, "org-1", { shareRiskSignals: true }); // consented to something else, not threat patterns

  const result = await reportThreatObservation(
    repo,
    { organizationId: "org-1", patternId: "THREAT-2026-001", severityScore: 0.8 },
    SALT,
  );

  assert.deepEqual(result, { accepted: false, reason: "no_consent" });
});

test("reportThreatObservation is rejected after consent has been revoked", async () => {
  const repo = new FakeThreatIntelRepository();
  await seedPattern(repo);
  await setConsent(repo, "org-1", { shareThreatPatterns: true });
  await revokeConsent(repo, "org-1");

  const result = await reportThreatObservation(
    repo,
    { organizationId: "org-1", patternId: "THREAT-2026-001", severityScore: 0.8 },
    SALT,
  );

  assert.deepEqual(result, { accepted: false, reason: "no_consent" });
});

test("reportThreatObservation is rejected for an unknown patternId, without throwing", async () => {
  const repo = new FakeThreatIntelRepository();
  await setConsent(repo, "org-1", { shareThreatPatterns: true });

  const result = await reportThreatObservation(
    repo,
    { organizationId: "org-1", patternId: "THREAT-DOES-NOT-EXIST", severityScore: 0.8 },
    SALT,
  );

  assert.deepEqual(result, { accepted: false, reason: "pattern_not_found" });
});

test("reportThreatObservation accepts a consented, valid report and updates the pattern's aggregate stats", async () => {
  const repo = new FakeThreatIntelRepository();
  const pattern = await seedPattern(repo, 0.5);
  await setConsent(repo, "org-1", { shareThreatPatterns: true });
  const now = new Date("2026-07-20T12:00:00Z");

  const result = await reportThreatObservation(
    repo,
    { organizationId: "org-1", patternId: "THREAT-2026-001", severityScore: 0.9, industry: "technology" },
    SALT,
    now,
  );

  assert.deepEqual(result, { accepted: true });

  const updated = await repo.getPatternById(pattern.id);
  assert.equal(updated?.totalObservations, 1);
  assert.equal(updated?.affectedOrganizationsCount, 1);
  assert.equal(updated?.lastObserved.toISOString(), now.toISOString());
  assert.deepEqual(updated?.affectedIndustries, ["technology"]);
});

test("reportThreatObservation recalculates avgSeverityScore as a correct running average across multiple reports", async () => {
  const repo = new FakeThreatIntelRepository();
  const pattern = await seedPattern(repo, 0.5); // initial avg from creation, 0 observations so far
  await setConsent(repo, "org-1", { shareThreatPatterns: true });
  await setConsent(repo, "org-2", { shareThreatPatterns: true });

  await reportThreatObservation(repo, { organizationId: "org-1", patternId: "THREAT-2026-001", severityScore: 1.0 }, SALT);
  const afterFirst = await repo.getPatternById(pattern.id);
  // Running average formula: (prevAvg * (n-1) + newScore) / n, n=1 after first observation
  // = (0.5 * 0 + 1.0) / 1 = 1.0
  assert.equal(afterFirst?.avgSeverityScore, 1.0);

  await reportThreatObservation(repo, { organizationId: "org-2", patternId: "THREAT-2026-001", severityScore: 0.0 }, SALT);
  const afterSecond = await repo.getPatternById(pattern.id);
  // n=2: (1.0 * 1 + 0.0) / 2 = 0.5
  assert.equal(afterSecond?.avgSeverityScore, 0.5);
});

test("reportThreatObservation counts distinct organizations, not raw report count -- the fix over Aegis's original unconditional increment", async () => {
  const repo = new FakeThreatIntelRepository();
  const pattern = await seedPattern(repo);
  await setConsent(repo, "org-1", { shareThreatPatterns: true });

  // Same org reports the same pattern three times.
  await reportThreatObservation(repo, { organizationId: "org-1", patternId: "THREAT-2026-001", severityScore: 0.5 }, SALT);
  await reportThreatObservation(repo, { organizationId: "org-1", patternId: "THREAT-2026-001", severityScore: 0.6 }, SALT);
  await reportThreatObservation(repo, { organizationId: "org-1", patternId: "THREAT-2026-001", severityScore: 0.7 }, SALT);

  const updated = await repo.getPatternById(pattern.id);
  assert.equal(updated?.totalObservations, 3, "total observation count should reflect all three reports");
  assert.equal(
    updated?.affectedOrganizationsCount,
    1,
    "affected org count should be 1 distinct org, not 3 -- this is the correctness fix over Aegis's original",
  );
});

test("reportThreatObservation accumulates distinct org count correctly across multiple different orgs", async () => {
  const repo = new FakeThreatIntelRepository();
  const pattern = await seedPattern(repo);
  await setConsent(repo, "org-1", { shareThreatPatterns: true });
  await setConsent(repo, "org-2", { shareThreatPatterns: true });
  await setConsent(repo, "org-3", { shareThreatPatterns: true });

  await reportThreatObservation(repo, { organizationId: "org-1", patternId: "THREAT-2026-001", severityScore: 0.5 }, SALT);
  await reportThreatObservation(repo, { organizationId: "org-2", patternId: "THREAT-2026-001", severityScore: 0.5 }, SALT);
  await reportThreatObservation(repo, { organizationId: "org-3", patternId: "THREAT-2026-001", severityScore: 0.5 }, SALT);

  const updated = await repo.getPatternById(pattern.id);
  assert.equal(updated?.affectedOrganizationsCount, 3);
});

test("reportThreatObservation never stores the raw organizationId in the observation record, only its hash", async () => {
  const repo = new FakeThreatIntelRepository();
  await seedPattern(repo);
  await setConsent(repo, "org-1", { shareThreatPatterns: true });

  await reportThreatObservation(repo, { organizationId: "org-1", patternId: "THREAT-2026-001", severityScore: 0.5 }, SALT);

  assert.equal(repo.observations.length, 1);
  const stored = repo.observations[0];
  assert.notEqual(stored?.organizationHash, "org-1");
  assert.match(stored?.organizationHash ?? "", /^[0-9a-f]{64}$/, "should be a SHA-256 hash");
});

test("reportThreatObservation writes an audit log entry with differentialPrivacyApplied: false (individual observations aren't DP-noised)", async () => {
  const repo = new FakeThreatIntelRepository();
  await seedPattern(repo);
  await setConsent(repo, "org-1", { shareThreatPatterns: true });

  await reportThreatObservation(repo, { organizationId: "org-1", patternId: "THREAT-2026-001", severityScore: 0.5 }, SALT);

  assert.equal(repo.dataSharingLogs.length, 1);
  const log = repo.dataSharingLogs[0];
  assert.equal(log?.dataType, "threat_observation");
  assert.equal(log?.differentialPrivacyApplied, false);
  assert.equal(log?.anonymizationApplied, true);
  assert.equal(log?.organizationId, "org-1");
});

test("reportThreatObservation uses a consistent org hash for the same org across multiple reports (needed for distinct-org counting to work at all)", async () => {
  const repo = new FakeThreatIntelRepository();
  await seedPattern(repo);
  await setConsent(repo, "org-1", { shareThreatPatterns: true });

  await reportThreatObservation(repo, { organizationId: "org-1", patternId: "THREAT-2026-001", severityScore: 0.5 }, SALT);
  await reportThreatObservation(repo, { organizationId: "org-1", patternId: "THREAT-2026-001", severityScore: 0.6 }, SALT);

  const [first, second] = repo.observations;
  assert.equal(first?.organizationHash, second?.organizationHash);
});
