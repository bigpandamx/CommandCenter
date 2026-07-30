import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IntelligenceReportError,
  createIntelligenceReport,
  listIntelligenceReports,
  updateIntelligenceReport,
  publishIntelligenceReport,
  unpublishIntelligenceReport,
} from "../src/intelligenceReports.js";
import { FakeThreatIntelRepository } from "../test/fakeRepository.js";

test("createIntelligenceReport always starts as draft, with no publishedAt", async () => {
  const repo = new FakeThreatIntelRepository();
  const report = await createIntelligenceReport(
    repo,
    { title: "Q3 2026 Ransomware Landscape", summary: "x", body: "x" },
    "staff-1",
  );

  assert.equal(report.status, "draft");
  assert.equal(report.publishedAt, null);
  assert.equal(report.authoredByStaffId, "staff-1");
});

test("createIntelligenceReport carries cross-references to patterns, actors, and CVEs, empty arrays normalized to null", async () => {
  const repo = new FakeThreatIntelRepository();
  const report = await createIntelligenceReport(
    repo,
    {
      title: "x",
      summary: "x",
      body: "x",
      relatedPatternIds: ["pattern-1", "pattern-2"],
      relatedActorIds: ["actor-1"],
      relatedVulnerabilityCveIds: [],
    },
    "staff-1",
  );

  assert.deepEqual(report.relatedPatternIds, ["pattern-1", "pattern-2"]);
  assert.deepEqual(report.relatedActorIds, ["actor-1"]);
  assert.equal(report.relatedVulnerabilityCveIds, null, "an empty array normalizes to null, same convention as CustomerPolicy's own fields");
});

test("listIntelligenceReports filters by status", async () => {
  const repo = new FakeThreatIntelRepository();
  const a = await createIntelligenceReport(repo, { title: "A", summary: "x", body: "x" }, "staff-1");
  await createIntelligenceReport(repo, { title: "B", summary: "x", body: "x" }, "staff-1");
  await publishIntelligenceReport(repo, a.id);

  const drafts = await listIntelligenceReports(repo, { status: "draft" });
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]!.title, "B");

  const published = await listIntelligenceReports(repo, { status: "published" });
  assert.equal(published.length, 1);
  assert.equal(published[0]!.title, "A");
});

test("publishIntelligenceReport sets status and publishedAt", async () => {
  const repo = new FakeThreatIntelRepository();
  const report = await createIntelligenceReport(repo, { title: "A", summary: "x", body: "x" }, "staff-1");
  const now = new Date("2026-07-01T00:00:00Z");

  const published = await publishIntelligenceReport(repo, report.id, now);
  assert.equal(published.status, "published");
  assert.equal(published.publishedAt?.toISOString(), now.toISOString());
});

test("the actual point of this being a revisitable decision, not a terminal one: unpublish reverts to draft, and it can be republished afterward", async () => {
  const repo = new FakeThreatIntelRepository();
  const report = await createIntelligenceReport(repo, { title: "A", summary: "x", body: "x" }, "staff-1");
  await publishIntelligenceReport(repo, report.id, new Date("2026-07-01T00:00:00Z"));

  const unpublished = await unpublishIntelligenceReport(repo, report.id);
  assert.equal(unpublished.status, "draft");

  const republished = await publishIntelligenceReport(repo, report.id, new Date("2026-08-01T00:00:00Z"));
  assert.equal(republished.status, "published");
});

test("unpublishIntelligenceReport leaves publishedAt as a historical fact, not cleared", async () => {
  const repo = new FakeThreatIntelRepository();
  const report = await createIntelligenceReport(repo, { title: "A", summary: "x", body: "x" }, "staff-1");
  const publishedAt = new Date("2026-07-01T00:00:00Z");
  await publishIntelligenceReport(repo, report.id, publishedAt);

  const unpublished = await unpublishIntelligenceReport(repo, report.id);
  assert.equal(unpublished.publishedAt?.toISOString(), publishedAt.toISOString(), "publishedAt records when it was published, not whether it's currently visible");
});

test("updateIntelligenceReport is a partial update -- an omitted field keeps its current value", async () => {
  const repo = new FakeThreatIntelRepository();
  const report = await createIntelligenceReport(
    repo,
    { title: "Original Title", summary: "Original summary", body: "Original body", relatedPatternIds: ["pattern-1"] },
    "staff-1",
  );

  const updated = await updateIntelligenceReport(repo, report.id, { title: "Revised Title" });
  assert.equal(updated.title, "Revised Title");
  assert.equal(updated.summary, "Original summary");
  assert.equal(updated.body, "Original body");
  assert.deepEqual(updated.relatedPatternIds, ["pattern-1"]);
});

test("updateIntelligenceReport works regardless of status -- a published report doesn't need to be unpublished first to correct it", async () => {
  const repo = new FakeThreatIntelRepository();
  const report = await createIntelligenceReport(repo, { title: "A", summary: "x", body: "x" }, "staff-1");
  await publishIntelligenceReport(repo, report.id);

  const corrected = await updateIntelligenceReport(repo, report.id, { body: "Corrected body text." });
  assert.equal(corrected.status, "published", "still published -- editing content is not the same action as unpublishing");
  assert.equal(corrected.body, "Corrected body text.");
});

test("updateIntelligenceReport throws report_not_found for an unknown id", async () => {
  const repo = new FakeThreatIntelRepository();
  await assert.rejects(
    () => updateIntelligenceReport(repo, "ghost-report", { title: "x" }),
    (err: unknown) => err instanceof IntelligenceReportError && err.code === "report_not_found",
  );
});

test("publishIntelligenceReport throws report_not_found for an unknown id", async () => {
  const repo = new FakeThreatIntelRepository();
  await assert.rejects(
    () => publishIntelligenceReport(repo, "ghost-report"),
    (err: unknown) => err instanceof IntelligenceReportError && err.code === "report_not_found",
  );
});
