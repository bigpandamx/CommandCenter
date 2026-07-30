import { test } from "node:test";
import assert from "node:assert/strict";
import { createThreatPattern } from "../src/threatPatterns.js";
import { setConsent, getConsent } from "../src/consent.js";
import { reportThreatObservation } from "../src/observations.js";
import {
  createDeletionRequest,
  listDeletionRequests,
  approveAndExecuteDeletion,
  rejectDeletionRequest,
  DeletionRequestError,
} from "../src/deletionRequests.js";
import { FakeThreatIntelRepository } from "./fakeRepository.js";

const SALT = "test-salt";

async function seedOrgWithData(repo: FakeThreatIntelRepository, organizationId: string) {
  const existing = await repo.getPatternByPatternId("THREAT-2026-001");
  const pattern =
    existing ??
    (await createThreatPattern(repo, {
      patternId: "THREAT-2026-001",
      patternName: "Test Pattern",
      threatType: "prompt_injection",
      severity: "high",
      description: "desc",
      attackVector: "vector",
      detectionSignature: {},
      avgSeverityScore: 0.5,
    }));
  await setConsent(repo, organizationId, { shareThreatPatterns: true });
  await reportThreatObservation(repo, { organizationId, patternId: "THREAT-2026-001", severityScore: 0.7 }, SALT);
  return pattern;
}

test("createDeletionRequest estimates the correct record count for deleteAll", async () => {
  const repo = new FakeThreatIntelRepository();
  await seedOrgWithData(repo, "org-1");

  const request = await createDeletionRequest(repo, "org-1", {}, SALT);

  assert.equal(request.status, "pending");
  assert.equal(request.deleteAll, true, "defaults to deleteAll: true");
  // 1 observation + 1 data sharing log (written by reportThreatObservation) = 2
  assert.equal(request.estimatedRecords, 2);
});

test("createDeletionRequest with a specific dataTypes filter only estimates that category", async () => {
  const repo = new FakeThreatIntelRepository();
  await seedOrgWithData(repo, "org-1");

  const request = await createDeletionRequest(
    repo,
    "org-1",
    { deleteAll: false, dataTypes: ["observations"] },
    SALT,
  );

  assert.equal(request.estimatedRecords, 1, "should only count observations, not sharing logs, when scoped");
});

test("createDeletionRequest for an org with no data estimates zero records without error", async () => {
  const repo = new FakeThreatIntelRepository();
  const request = await createDeletionRequest(repo, "org-with-no-data", {}, SALT);
  assert.equal(request.estimatedRecords, 0);
});

test("listDeletionRequests returns only the requesting org's requests, most recent first", async () => {
  const repo = new FakeThreatIntelRepository();
  await seedOrgWithData(repo, "org-1");
  await seedOrgWithData(repo, "org-2");

  await createDeletionRequest(repo, "org-1", { reason: "first" }, SALT, new Date("2026-01-01T00:00:00Z"));
  await createDeletionRequest(repo, "org-1", { reason: "second" }, SALT, new Date("2026-02-01T00:00:00Z"));
  await createDeletionRequest(repo, "org-2", { reason: "other org" }, SALT);

  const results = await listDeletionRequests(repo, "org-1");
  assert.equal(results.length, 2);
  assert.equal(results[0]?.reason, "second", "most recent first");
});

test("approveAndExecuteDeletion deletes the matching observations and sharing logs", async () => {
  const repo = new FakeThreatIntelRepository();
  await seedOrgWithData(repo, "org-1");
  const request = await createDeletionRequest(repo, "org-1", {}, SALT);

  const result = await approveAndExecuteDeletion(repo, request.id, "staff-1", SALT);

  assert.equal(result.status, "completed");
  assert.equal(result.actualRecordsDeleted, 2);
  assert.equal(result.processedByStaffId, "staff-1");
  assert.equal(repo.observations.length, 0, "observations must actually be gone");
  assert.equal(repo.dataSharingLogs.length, 0, "sharing logs must actually be gone");
});

test("approveAndExecuteDeletion revokes the org's consent as a side effect", async () => {
  const repo = new FakeThreatIntelRepository();
  await seedOrgWithData(repo, "org-1");
  const request = await createDeletionRequest(repo, "org-1", {}, SALT);

  await approveAndExecuteDeletion(repo, request.id, "staff-1", SALT);

  const consent = await getConsent(repo, "org-1");
  assert.equal(consent?.shareThreatPatterns, false);
  assert.ok(consent?.revokedAt, "consent must be revoked so future sharing stops too, not just past data wiped");
});

test("approveAndExecuteDeletion does not touch another org's data", async () => {
  const repo = new FakeThreatIntelRepository();
  await seedOrgWithData(repo, "org-1");
  await seedOrgWithData(repo, "org-2");
  const request = await createDeletionRequest(repo, "org-1", {}, SALT);

  await approveAndExecuteDeletion(repo, request.id, "staff-1", SALT);

  // org-2's observation and log must survive.
  assert.equal(repo.observations.length, 1);
  assert.equal(repo.dataSharingLogs.length, 1);
});

test("approveAndExecuteDeletion throws for an unknown request", async () => {
  const repo = new FakeThreatIntelRepository();
  await assert.rejects(
    () => approveAndExecuteDeletion(repo, "ghost-request", "staff-1", SALT),
    (err: unknown) => err instanceof DeletionRequestError && err.code === "request_not_found",
  );
});

test("approveAndExecuteDeletion cannot be run twice on the same request", async () => {
  const repo = new FakeThreatIntelRepository();
  await seedOrgWithData(repo, "org-1");
  const request = await createDeletionRequest(repo, "org-1", {}, SALT);
  await approveAndExecuteDeletion(repo, request.id, "staff-1", SALT);

  await assert.rejects(
    () => approveAndExecuteDeletion(repo, request.id, "staff-2", SALT),
    (err: unknown) => err instanceof DeletionRequestError && err.code === "already_processed",
  );
});

test("rejectDeletionRequest marks the request rejected without deleting anything", async () => {
  const repo = new FakeThreatIntelRepository();
  await seedOrgWithData(repo, "org-1");
  const request = await createDeletionRequest(repo, "org-1", {}, SALT);

  const rejected = await rejectDeletionRequest(repo, request.id, "staff-1");

  assert.equal(rejected.status, "rejected");
  assert.equal(repo.observations.length, 1, "data must be untouched when rejected");
  assert.equal(repo.dataSharingLogs.length, 1);
});

test("rejectDeletionRequest cannot be applied to an already-processed request", async () => {
  const repo = new FakeThreatIntelRepository();
  await seedOrgWithData(repo, "org-1");
  const request = await createDeletionRequest(repo, "org-1", {}, SALT);
  await approveAndExecuteDeletion(repo, request.id, "staff-1", SALT);

  await assert.rejects(
    () => rejectDeletionRequest(repo, request.id, "staff-2"),
    (err: unknown) => err instanceof DeletionRequestError && err.code === "already_processed",
  );
});
