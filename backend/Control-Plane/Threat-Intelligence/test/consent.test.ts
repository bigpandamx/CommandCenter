import { test } from "node:test";
import assert from "node:assert/strict";
import { getConsent, setConsent, revokeConsent } from "../src/consent.js";
import { FakeThreatIntelRepository } from "./fakeRepository.js";

test("getConsent returns null when no consent has ever been set", async () => {
  const repo = new FakeThreatIntelRepository();
  assert.equal(await getConsent(repo, "org-1"), null);
});

test("setConsent creates a new consent record with privacy-first defaults for unspecified fields", async () => {
  const repo = new FakeThreatIntelRepository();
  const consent = await setConsent(repo, "org-1", { shareThreatPatterns: true });

  assert.equal(consent.shareThreatPatterns, true);
  assert.equal(consent.shareRiskSignals, false, "unspecified flags default to false, not true");
  assert.equal(consent.shareBenchmarkData, false);
  assert.equal(consent.anonymizationLevel, "high", "defaults to the most private option");
  assert.equal(consent.revokedAt, null);
});

test("setConsent preserves previously-set fields not mentioned in a later partial update", async () => {
  const repo = new FakeThreatIntelRepository();
  await setConsent(repo, "org-1", { shareThreatPatterns: true, anonymizationLevel: "medium" });

  const updated = await setConsent(repo, "org-1", { shareRiskSignals: true });

  assert.equal(updated.shareThreatPatterns, true, "must not have been reset by the second, unrelated call");
  assert.equal(updated.anonymizationLevel, "medium", "must not have been reset to the default");
  assert.equal(updated.shareRiskSignals, true);
});

test("setConsent clears a prior revocation -- re-consenting after revoking must actually re-enable sharing", async () => {
  const repo = new FakeThreatIntelRepository();
  await setConsent(repo, "org-1", { shareThreatPatterns: true });
  await revokeConsent(repo, "org-1");

  const reconsented = await setConsent(repo, "org-1", { shareThreatPatterns: true });
  assert.equal(reconsented.revokedAt, null);
});

test("revokeConsent turns off every sharing flag regardless of what was previously set", async () => {
  const repo = new FakeThreatIntelRepository();
  await setConsent(repo, "org-1", { shareThreatPatterns: true, shareRiskSignals: true, shareBenchmarkData: true });

  const revoked = await revokeConsent(repo, "org-1");

  assert.equal(revoked.shareThreatPatterns, false);
  assert.equal(revoked.shareRiskSignals, false);
  assert.equal(revoked.shareBenchmarkData, false);
  assert.ok(revoked.revokedAt);
});

test("revokeConsent on an org with no prior consent record still produces a valid (all-false, revoked) record", async () => {
  const repo = new FakeThreatIntelRepository();
  const revoked = await revokeConsent(repo, "org-with-no-history");
  assert.equal(revoked.shareThreatPatterns, false);
  assert.ok(revoked.revokedAt);
});
