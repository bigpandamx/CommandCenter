import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ComplianceQueueError,
  markPendingReview,
  advanceToReviewIfNew,
  markAsDuplicate,
  rejectUpdate,
  publishUpdate,
  getQueueSummary,
  listUpdatesByStatus,
} from "../src/queueService.js";
import { analyzeComplianceUpdate } from "../src/analysisService.js";
import { FakeComplianceRepository } from "../test/fakeRepository.js";
import { FakeAIProvider } from "../../../Customer-Connections/AIChat/test/fakeAIProvider.js";
import { registerComplianceSource } from "../src/sourceManagement.js";
import { ingestComplianceItems } from "../src/ingestion.js";

async function seedUpdate(repo: FakeComplianceRepository, title = "Doc") {
  const source = await registerComplianceSource(repo, {
    name: `Source for ${title}`,
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: `https://example.gov/${randomUUID()}.xml`,
  });
  await ingestComplianceItems(repo, source, [
    { externalId: "a", title, summary: "s", url: `https://example.gov/${randomUUID()}`, publishedAt: null, country: null, state: null },
  ]);
  return (await repo.getUpdateBySourceAndExternalId(source.id, "a"))!;
}

const VALID_ANALYSIS_RESPONSE = JSON.stringify({
  isAiRelated: true,
  enforceability: "enforceable",
  country: null,
  state: null,
  industries: [],
  topics: [],
  summary: "s",
  riskLevel: "medium",
  actionItems: [],
  keywords: [],
  obligations: [],
});

test("a newly ingested update starts as 'new'", async () => {
  const repo = new FakeComplianceRepository();
  const update = await seedUpdate(repo);
  assert.equal(update.status, "new");
});

test("the worked example: new -> pending_review -> published, the normal path through the inbox", async () => {
  const repo = new FakeComplianceRepository();
  const update = await seedUpdate(repo);

  const afterReview = await markPendingReview(repo, update.id);
  assert.equal(afterReview.status, "pending_review");

  const afterPublish = await publishUpdate(repo, update.id);
  assert.equal(afterPublish.status, "published");
});

test("published is terminal -- no further transition is allowed", async () => {
  const repo = new FakeComplianceRepository();
  const update = await seedUpdate(repo);
  await markPendingReview(repo, update.id);
  await publishUpdate(repo, update.id);

  await assert.rejects(
    () => markAsDuplicate(repo, update.id),
    (err: unknown) => err instanceof ComplianceQueueError && err.code === "invalid_transition",
  );
});

test("an invalid transition (new -> published directly, skipping review) is rejected", async () => {
  const repo = new FakeComplianceRepository();
  const update = await seedUpdate(repo);

  await assert.rejects(
    () => publishUpdate(repo, update.id),
    (err: unknown) => err instanceof ComplianceQueueError && err.code === "invalid_transition",
  );
});

test("staff can undo a rejection or duplicate flag back to pending_review", async () => {
  const repo = new FakeComplianceRepository();
  const update = await seedUpdate(repo);
  await markPendingReview(repo, update.id);
  await rejectUpdate(repo, update.id);

  const undone = await markPendingReview(repo, update.id);
  assert.equal(undone.status, "pending_review");
});

test("markAsDuplicate / rejectUpdate / publishUpdate all throw update_not_found for an unknown update", async () => {
  const repo = new FakeComplianceRepository();
  await assert.rejects(
    () => markAsDuplicate(repo, "ghost-update"),
    (err: unknown) => err instanceof ComplianceQueueError && err.code === "update_not_found",
  );
});

test("advanceToReviewIfNew moves a 'new' update to pending_review", async () => {
  const repo = new FakeComplianceRepository();
  const update = await seedUpdate(repo);

  await advanceToReviewIfNew(repo, update.id);

  const stored = await repo.getUpdateById(update.id);
  assert.equal(stored?.status, "pending_review");
});

test("advanceToReviewIfNew is a silent no-op for an update already at pending_review -- doesn't throw", async () => {
  const repo = new FakeComplianceRepository();
  const update = await seedUpdate(repo);
  await markPendingReview(repo, update.id);

  await advanceToReviewIfNew(repo, update.id);

  const stored = await repo.getUpdateById(update.id);
  assert.equal(stored?.status, "pending_review");
});

test("advanceToReviewIfNew never pulls a rejected update back to pending_review", async () => {
  const repo = new FakeComplianceRepository();
  const update = await seedUpdate(repo);
  await markPendingReview(repo, update.id);
  await rejectUpdate(repo, update.id);

  await advanceToReviewIfNew(repo, update.id);

  const stored = await repo.getUpdateById(update.id);
  assert.equal(stored?.status, "rejected");
});

test("advanceToReviewIfNew never pulls a duplicate-flagged update back either", async () => {
  const repo = new FakeComplianceRepository();
  const update = await seedUpdate(repo);
  await markPendingReview(repo, update.id);
  await markAsDuplicate(repo, update.id);

  await advanceToReviewIfNew(repo, update.id);

  const stored = await repo.getUpdateById(update.id);
  assert.equal(stored?.status, "duplicate");
});

test("the real hook: analyzeComplianceUpdate advances a 'new' update to pending_review automatically", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const update = await seedUpdate(repo);
  assert.equal(update.status, "new");

  aiProvider.nextResponse = { content: VALID_ANALYSIS_RESPONSE, tokensUsed: 200, model: "claude-sonnet-5" };
  await analyzeComplianceUpdate(repo, aiProvider, update.id);

  const stored = await repo.getUpdateById(update.id);
  assert.equal(stored?.status, "pending_review");
});

test("re-analyzing an already-rejected update does not silently un-reject it", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const update = await seedUpdate(repo);
  await markPendingReview(repo, update.id);
  await rejectUpdate(repo, update.id);

  aiProvider.nextResponse = { content: VALID_ANALYSIS_RESPONSE, tokensUsed: 200, model: "claude-sonnet-5" };
  await analyzeComplianceUpdate(repo, aiProvider, update.id);

  const stored = await repo.getUpdateById(update.id);
  assert.equal(stored?.status, "rejected");
});

test("getQueueSummary counts every bucket correctly, the 'inbox folder counts' worked example", async () => {
  const repo = new FakeComplianceRepository();

  const a = await seedUpdate(repo, "A");
  const b = await seedUpdate(repo, "B");
  const c = await seedUpdate(repo, "C");
  const d = await seedUpdate(repo, "D");
  await seedUpdate(repo, "E");

  await markPendingReview(repo, a.id);

  await markPendingReview(repo, b.id);
  await markAsDuplicate(repo, b.id);

  await markPendingReview(repo, c.id);
  await rejectUpdate(repo, c.id);

  await markPendingReview(repo, d.id);
  await publishUpdate(repo, d.id);

  const summary = await getQueueSummary(repo);
  assert.deepEqual(summary, { new: 1, pendingReview: 1, duplicate: 1, rejected: 1, published: 1 });
});

test("listUpdatesByStatus returns only updates in the given state", async () => {
  const repo = new FakeComplianceRepository();
  const a = await seedUpdate(repo, "A");
  await seedUpdate(repo, "B");
  await markPendingReview(repo, a.id);

  const pending = await listUpdatesByStatus(repo, "pending_review");
  assert.equal(pending.length, 1);
  assert.equal(pending[0]!.title, "A");

  const stillNew = await listUpdatesByStatus(repo, "new");
  assert.equal(stillNew.length, 1);
  assert.equal(stillNew[0]!.title, "B");
});
