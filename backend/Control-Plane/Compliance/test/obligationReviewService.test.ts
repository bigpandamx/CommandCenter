import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ObligationReviewError,
  approveObligation,
  rejectObligation,
  resetObligationToPendingReview,
  editObligation,
  mergeObligation,
} from "../src/obligationReviewService.js";
import { analyzeComplianceUpdate } from "../src/analysisService.js";
import { FakeComplianceRepository } from "../test/fakeRepository.js";
import { FakeAIProvider } from "../../../Customer-Connections/AIChat/test/fakeAIProvider.js";
import { registerComplianceSource } from "../src/sourceManagement.js";
import { ingestComplianceItems } from "../src/ingestion.js";

async function seedAnalyzedUpdate(
  repo: FakeComplianceRepository,
  aiProvider: FakeAIProvider,
  obligationsResponse: Array<{ description: string; obligationType: string; industries: string[]; deadlineDescription: string | null; confidence?: number }>,
  title = "Doc",
) {
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
  const update = (await repo.getUpdateBySourceAndExternalId(source.id, "a"))!;

  aiProvider.nextResponse = {
    content: JSON.stringify({
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
      obligations: obligationsResponse,
    }),
    tokensUsed: 200,
    model: "claude-sonnet-5",
  };
  await analyzeComplianceUpdate(repo, aiProvider, update.id);
  return { update, obligations: await repo.listObligationsForUpdate(update.id) };
}

test("a newly extracted obligation starts as pending_review, with its AI-reported confidence preserved", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const { obligations } = await seedAnalyzedUpdate(repo, aiProvider, [
    { description: "Disclose AI use", obligationType: "disclosure", industries: [], deadlineDescription: null, confidence: 92 },
  ]);

  assert.equal(obligations[0]!.status, "pending_review");
  assert.equal(obligations[0]!.confidence, 92);
  assert.equal(obligations[0]!.mergedIntoObligationId, null);
});

test("a response omitting confidence results in null, not a fabricated value", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const { obligations } = await seedAnalyzedUpdate(repo, aiProvider, [
    { description: "Disclose AI use", obligationType: "disclosure", industries: [], deadlineDescription: null },
  ]);

  assert.equal(obligations[0]!.confidence, null);
});

test("an out-of-range confidence (e.g. 150) is treated as invalid and becomes null, not clamped or rejected", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const { obligations } = await seedAnalyzedUpdate(repo, aiProvider, [
    { description: "Disclose AI use", obligationType: "disclosure", industries: [], deadlineDescription: null, confidence: 150 },
  ]);

  assert.equal(obligations[0]!.confidence, null);
});

test("approveObligation / rejectObligation / resetObligationToPendingReview: the worked example, full round trip", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const { obligations } = await seedAnalyzedUpdate(repo, aiProvider, [
    { description: "Disclose AI use", obligationType: "disclosure", industries: [], deadlineDescription: null, confidence: 97 },
  ]);
  const obligationId = obligations[0]!.id;

  const approved = await approveObligation(repo, obligationId);
  assert.equal(approved.status, "approved");

  const rejected = await rejectObligation(repo, obligationId);
  assert.equal(rejected.status, "rejected");

  const reset = await resetObligationToPendingReview(repo, obligationId);
  assert.equal(reset.status, "pending_review");
});

test("approveObligation throws obligation_not_found for an unknown obligation", async () => {
  const repo = new FakeComplianceRepository();
  await assert.rejects(
    () => approveObligation(repo, "ghost-obligation"),
    (err: unknown) => err instanceof ObligationReviewError && err.code === "obligation_not_found",
  );
});

test("editObligation updates fields without changing status", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const { obligations } = await seedAnalyzedUpdate(repo, aiProvider, [
    { description: "Disclose AI use", obligationType: "disclosure", industries: ["ai"], deadlineDescription: null, confidence: 80 },
  ]);
  const obligationId = obligations[0]!.id;
  await approveObligation(repo, obligationId);

  const edited = await editObligation(repo, obligationId, { description: "Disclose AI interaction to end users clearly" });

  assert.equal(edited.description, "Disclose AI interaction to end users clearly");
  assert.equal(edited.status, "approved");
});

test("editObligation recomputes deadlineDate when deadlineDescription changes", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const { obligations } = await seedAnalyzedUpdate(repo, aiProvider, [
    { description: "File a report", obligationType: "reporting", industries: [], deadlineDescription: null, confidence: 80 },
  ]);
  const obligationId = obligations[0]!.id;

  const edited = await editObligation(repo, obligationId, { deadlineDescription: "within 90 days of the effective date" });

  assert.equal(edited.deadlineDescription, "within 90 days of the effective date");
  assert.equal(edited.deadlineDate, null);
});

test("editObligation only touches provided fields, leaving the rest exactly as they were", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const { obligations } = await seedAnalyzedUpdate(repo, aiProvider, [
    { description: "Disclose AI use", obligationType: "disclosure", industries: ["ai", "healthcare"], deadlineDescription: null, confidence: 80 },
  ]);
  const obligationId = obligations[0]!.id;

  const edited = await editObligation(repo, obligationId, { obligationType: "notification" });

  assert.equal(edited.obligationType, "notification");
  assert.equal(edited.description, "Disclose AI use");
  assert.deepEqual(edited.industries, ["ai", "healthcare"]);
});

test("mergeObligation: the worked example -- source is rejected and points at the target, non-destructively", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const { obligations } = await seedAnalyzedUpdate(repo, aiProvider, [
    { description: "Disclose AI use", obligationType: "disclosure", industries: [], deadlineDescription: null, confidence: 90 },
    { description: "Inform users of AI interaction", obligationType: "disclosure", industries: [], deadlineDescription: null, confidence: 85 },
  ]);
  const [first, second] = obligations;

  const merged = await mergeObligation(repo, second!.id, first!.id);

  assert.equal(merged.status, "rejected");
  assert.equal(merged.mergedIntoObligationId, first!.id);
  const targetAfter = await repo.getObligationById(first!.id);
  assert.equal(targetAfter?.description, "Disclose AI use");
  assert.equal(targetAfter?.status, "pending_review");
});

test("mergeObligation rejects merging an obligation into itself", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const { obligations } = await seedAnalyzedUpdate(repo, aiProvider, [
    { description: "Disclose AI use", obligationType: "disclosure", industries: [], deadlineDescription: null, confidence: 90 },
  ]);
  await assert.rejects(
    () => mergeObligation(repo, obligations[0]!.id, obligations[0]!.id),
    (err: unknown) => err instanceof ObligationReviewError && err.code === "cannot_merge_into_self",
  );
});

test("mergeObligation throws target_not_found for an unknown target", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const { obligations } = await seedAnalyzedUpdate(repo, aiProvider, [
    { description: "Disclose AI use", obligationType: "disclosure", industries: [], deadlineDescription: null, confidence: 90 },
  ]);
  await assert.rejects(
    () => mergeObligation(repo, obligations[0]!.id, "ghost-target"),
    (err: unknown) => err instanceof ObligationReviewError && err.code === "target_not_found",
  );
});

test("resetObligationToPendingReview also clears a merge relationship", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const { obligations } = await seedAnalyzedUpdate(repo, aiProvider, [
    { description: "Disclose AI use", obligationType: "disclosure", industries: [], deadlineDescription: null, confidence: 90 },
    { description: "Inform users of AI interaction", obligationType: "disclosure", industries: [], deadlineDescription: null, confidence: 85 },
  ]);
  const [first, second] = obligations;
  await mergeObligation(repo, second!.id, first!.id);

  const reset = await resetObligationToPendingReview(repo, second!.id);
  assert.equal(reset.status, "pending_review");
  assert.equal(reset.mergedIntoObligationId, null);
});

test("the critical case: re-analysis never silently discards a staff member's review work", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const { update, obligations } = await seedAnalyzedUpdate(repo, aiProvider, [
    { description: "Disclose AI use", obligationType: "disclosure", industries: [], deadlineDescription: null, confidence: 90 },
  ]);
  await approveObligation(repo, obligations[0]!.id);

  aiProvider.nextResponse = {
    content: JSON.stringify({
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
      obligations: [{ description: "A completely different obligation", obligationType: "reporting", industries: [], deadlineDescription: null }],
    }),
    tokensUsed: 200,
    model: "claude-sonnet-5",
  };
  await analyzeComplianceUpdate(repo, aiProvider, update.id);

  const afterReanalysis = await repo.listObligationsForUpdate(update.id);
  assert.equal(afterReanalysis.length, 1);
  assert.equal(afterReanalysis[0]!.description, "Disclose AI use");
  assert.equal(afterReanalysis[0]!.status, "approved");
});
