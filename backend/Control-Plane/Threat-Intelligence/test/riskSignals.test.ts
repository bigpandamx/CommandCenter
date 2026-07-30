import { test } from "node:test";
import assert from "node:assert/strict";
import { setConsent } from "../src/consent.js";
import { reportRiskSignal } from "../src/riskSignals.js";
import { FakeThreatIntelRepository } from "./fakeRepository.js";

test("reportRiskSignal is rejected when the org hasn't consented to shareRiskSignals", async () => {
  const repo = new FakeThreatIntelRepository();
  const result = await reportRiskSignal(
    repo,
    { organizationId: "org-1", signalType: "deployment_failure", industry: "technology", rawSignalCount: 5, totalDeploymentsCount: 100, severityScore: 0.5 },
    "salt",
  );
  assert.deepEqual(result, { accepted: false, reason: "no_consent" });
  assert.equal(repo.riskSignalAggregates.length, 0);
});

test("reportRiskSignal is rejected when consented to shareThreatPatterns but not shareRiskSignals specifically", async () => {
  const repo = new FakeThreatIntelRepository();
  await setConsent(repo, "org-1", { shareThreatPatterns: true }); // wrong flag
  const result = await reportRiskSignal(
    repo,
    { organizationId: "org-1", signalType: "deployment_failure", industry: "technology", rawSignalCount: 5, totalDeploymentsCount: 100, severityScore: 0.5 },
    "salt",
  );
  assert.deepEqual(result, { accepted: false, reason: "no_consent" });
});

test("reportRiskSignal accepted and stored with noise applied when consented", async () => {
  const repo = new FakeThreatIntelRepository();
  await setConsent(repo, "org-1", { shareRiskSignals: true });

  const result = await reportRiskSignal(
    repo,
    { organizationId: "org-1", signalType: "deployment_failure", industry: "technology", rawSignalCount: 5, totalDeploymentsCount: 100, severityScore: 0.5 },
    "salt",
  );

  assert.deepEqual(result, { accepted: true });
  assert.equal(repo.riskSignalAggregates.length, 1);
});

test("reportRiskSignal never stores the raw organizationId, only its hash", async () => {
  const repo = new FakeThreatIntelRepository();
  await setConsent(repo, "org-1", { shareRiskSignals: true });
  await reportRiskSignal(
    repo,
    { organizationId: "org-1", signalType: "deployment_failure", industry: "technology", rawSignalCount: 5, totalDeploymentsCount: 100, severityScore: 0.5 },
    "salt",
  );
  const stored = repo.riskSignalAggregates[0];
  assert.notEqual(stored?.organizationHash, "org-1");
  assert.match(stored?.organizationHash ?? "", /^[0-9a-f]{64}$/);
});

test("reportRiskSignal uses the epsilon matching the org's anonymization level", async () => {
  const repo = new FakeThreatIntelRepository();
  await setConsent(repo, "org-1", { shareRiskSignals: true, anonymizationLevel: "low" }); // epsilon 2.0

  await reportRiskSignal(
    repo,
    { organizationId: "org-1", signalType: "deployment_failure", industry: "technology", rawSignalCount: 5, totalDeploymentsCount: 100, severityScore: 0.5 },
    "salt",
  );

  assert.equal(repo.riskSignalAggregates[0]?.noiseEpsilon, 2.0);
});

test("reportRiskSignal's noised count is in the statistical neighborhood of the raw count across many trials (not wildly off)", async () => {
  const repo = new FakeThreatIntelRepository();
  await setConsent(repo, "org-1", { shareRiskSignals: true, anonymizationLevel: "low" }); // epsilon 2.0, less noise

  let sum = 0;
  const trials = 500;
  for (let i = 0; i < trials; i++) {
    const r = new FakeThreatIntelRepository();
    await setConsent(r, "org-1", { shareRiskSignals: true, anonymizationLevel: "low" });
    await reportRiskSignal(
      r,
      { organizationId: "org-1", signalType: "deployment_failure", industry: "technology", rawSignalCount: 50, totalDeploymentsCount: 100, severityScore: 0.5 },
      "salt",
    );
    sum += r.riskSignalAggregates[0]?.signalCount ?? 0;
  }
  const meanCount = sum / trials;
  assert.ok(meanCount > 40 && meanCount < 60, `mean noised count ${meanCount} too far from raw value 50`);
});

test("reportRiskSignal writes an audit log entry with differentialPrivacyApplied: true (unlike observations, which are false)", async () => {
  const repo = new FakeThreatIntelRepository();
  await setConsent(repo, "org-1", { shareRiskSignals: true });
  await reportRiskSignal(
    repo,
    { organizationId: "org-1", signalType: "deployment_failure", industry: "technology", rawSignalCount: 5, totalDeploymentsCount: 100, severityScore: 0.5 },
    "salt",
  );
  const log = repo.dataSharingLogs[0];
  assert.equal(log?.dataType, "risk_signal");
  assert.equal(log?.differentialPrivacyApplied, true);
});
