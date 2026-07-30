import { test } from "node:test";
import assert from "node:assert/strict";
import { registerComplianceSource } from "../src/sourceManagement.js";
import { ingestComplianceItems } from "../src/ingestion.js";
import {
  parseAnalysisResponse,
  parseRelativeDeadline,
  analyzeComplianceUpdate,
  analyzeUnanalyzedUpdates,
  ComplianceAnalysisError,
} from "../src/analysisService.js";
import { FakeComplianceRepository } from "./fakeRepository.js";
import { FakeAIProvider } from "../../../Customer-Connections/AIChat/test/fakeAIProvider.js";

const VALID_RESPONSE = JSON.stringify({
  isAiRelated: true,
  enforceability: "enforceable",
  country: "US",
  state: "CA",
  industries: ["ai", "healthcare"],
  topics: ["risk-management"],
  summary: "This rule requires AI risk assessments for healthcare providers.",
  riskLevel: "high",
  actionItems: ["Review AI governance policy"],
  keywords: ["ai", "risk", "healthcare"],
  obligations: [
    {
      description: "Conduct an annual AI risk assessment",
      obligationType: "assessment",
      industries: ["healthcare"],
      deadlineDescription: "within 90 days of the effective date",
    },
  ],
});

// --- parseAnalysisResponse: the untrusted-input validation surface ---

test("parseAnalysisResponse accepts a well-formed response", () => {
  const result = parseAnalysisResponse(VALID_RESPONSE);
  assert.equal(result.isAiRelated, true);
  assert.equal(result.enforceability, "enforceable");
  assert.equal(result.country, "US");
  assert.equal(result.state, "CA");
  assert.deepEqual(result.industries, ["ai", "healthcare"]);
  assert.equal(result.riskLevel, "high");
  assert.equal(result.obligations.length, 1);
});

test("parseAnalysisResponse strips markdown code fences before parsing", () => {
  const fenced = "```json\n" + VALID_RESPONSE + "\n```";
  const result = parseAnalysisResponse(fenced);
  assert.equal(result.isAiRelated, true);
});

test("parseAnalysisResponse strips bare code fences (no 'json' language tag) too", () => {
  const fenced = "```\n" + VALID_RESPONSE + "\n```";
  const result = parseAnalysisResponse(fenced);
  assert.equal(result.isAiRelated, true);
});

test("parseAnalysisResponse accepts null country and state", () => {
  const response = JSON.stringify({
    isAiRelated: false,
    enforceability: "unknown",
    country: null,
    state: null,
    industries: [],
    topics: [],
    summary: "Not clearly applicable.",
    riskLevel: "low",
    actionItems: [],
    keywords: [],
    obligations: [],
  });
  const result = parseAnalysisResponse(response);
  assert.equal(result.country, null);
  assert.equal(result.state, null);
});

test("parseAnalysisResponse accepts an empty obligations array -- most documents impose none", () => {
  const bad = JSON.parse(VALID_RESPONSE);
  bad.obligations = [];
  const result = parseAnalysisResponse(JSON.stringify(bad));
  assert.deepEqual(result.obligations, []);
});

test("parseAnalysisResponse rejects malformed JSON", () => {
  assert.throws(
    () => parseAnalysisResponse("not json at all"),
    (err: unknown) => err instanceof ComplianceAnalysisError && err.code === "invalid_ai_response",
  );
});

test("parseAnalysisResponse rejects a JSON value that isn't an object", () => {
  assert.throws(
    () => parseAnalysisResponse("42"),
    (err: unknown) => err instanceof ComplianceAnalysisError && err.code === "invalid_ai_response",
  );
  assert.throws(
    () => parseAnalysisResponse("null"),
    (err: unknown) => err instanceof ComplianceAnalysisError && err.code === "invalid_ai_response",
  );
  assert.throws(
    () => parseAnalysisResponse("[1,2,3]"),
    (err: unknown) => err instanceof ComplianceAnalysisError && err.code === "invalid_ai_response",
  );
});

test("parseAnalysisResponse rejects a non-boolean isAiRelated", () => {
  const bad = JSON.parse(VALID_RESPONSE);
  bad.isAiRelated = "yes";
  assert.throws(
    () => parseAnalysisResponse(JSON.stringify(bad)),
    (err: unknown) => err instanceof ComplianceAnalysisError && err.code === "invalid_ai_response",
  );
});

test("parseAnalysisResponse rejects an enforceability value outside the allowed enum", () => {
  const bad = JSON.parse(VALID_RESPONSE);
  bad.enforceability = "maybe";
  assert.throws(
    () => parseAnalysisResponse(JSON.stringify(bad)),
    (err: unknown) => err instanceof ComplianceAnalysisError && err.code === "invalid_ai_response",
  );
});

test("parseAnalysisResponse rejects a riskLevel value outside the allowed enum", () => {
  const bad = JSON.parse(VALID_RESPONSE);
  bad.riskLevel = "extreme";
  assert.throws(
    () => parseAnalysisResponse(JSON.stringify(bad)),
    (err: unknown) => err instanceof ComplianceAnalysisError && err.code === "invalid_ai_response",
  );
});

test("parseAnalysisResponse rejects industries that isn't a string array", () => {
  const bad = JSON.parse(VALID_RESPONSE);
  bad.industries = "ai, healthcare";
  assert.throws(
    () => parseAnalysisResponse(JSON.stringify(bad)),
    (err: unknown) => err instanceof ComplianceAnalysisError && err.code === "invalid_ai_response",
  );
});

test("parseAnalysisResponse rejects an array with a non-string element", () => {
  const bad = JSON.parse(VALID_RESPONSE);
  bad.keywords = ["ai", 42, "risk"];
  assert.throws(
    () => parseAnalysisResponse(JSON.stringify(bad)),
    (err: unknown) => err instanceof ComplianceAnalysisError && err.code === "invalid_ai_response",
  );
});

test("parseAnalysisResponse rejects an empty summary", () => {
  const bad = JSON.parse(VALID_RESPONSE);
  bad.summary = "   ";
  assert.throws(
    () => parseAnalysisResponse(JSON.stringify(bad)),
    (err: unknown) => err instanceof ComplianceAnalysisError && err.code === "invalid_ai_response",
  );
});

test("parseAnalysisResponse rejects a response missing a required field entirely", () => {
  const bad = JSON.parse(VALID_RESPONSE);
  delete bad.riskLevel;
  assert.throws(
    () => parseAnalysisResponse(JSON.stringify(bad)),
    (err: unknown) => err instanceof ComplianceAnalysisError && err.code === "invalid_ai_response",
  );
});

test("parseAnalysisResponse rejects a response missing obligations entirely", () => {
  const bad = JSON.parse(VALID_RESPONSE);
  delete bad.obligations;
  assert.throws(
    () => parseAnalysisResponse(JSON.stringify(bad)),
    (err: unknown) => err instanceof ComplianceAnalysisError && err.code === "invalid_ai_response",
  );
});

test("parseAnalysisResponse rejects obligations that isn't an array", () => {
  const bad = JSON.parse(VALID_RESPONSE);
  bad.obligations = "none";
  assert.throws(
    () => parseAnalysisResponse(JSON.stringify(bad)),
    (err: unknown) => err instanceof ComplianceAnalysisError && err.code === "invalid_ai_response",
  );
});

test("parseAnalysisResponse rejects an obligation missing a description", () => {
  const bad = JSON.parse(VALID_RESPONSE);
  delete bad.obligations[0].description;
  assert.throws(
    () => parseAnalysisResponse(JSON.stringify(bad)),
    (err: unknown) => err instanceof ComplianceAnalysisError && err.code === "invalid_ai_response",
  );
});

test("parseAnalysisResponse rejects an obligation whose industries isn't a string array", () => {
  const bad = JSON.parse(VALID_RESPONSE);
  bad.obligations[0].industries = "healthcare";
  assert.throws(
    () => parseAnalysisResponse(JSON.stringify(bad)),
    (err: unknown) => err instanceof ComplianceAnalysisError && err.code === "invalid_ai_response",
  );
});

test("parseAnalysisResponse lowercases obligationType for consistency", () => {
  const bad = JSON.parse(VALID_RESPONSE);
  bad.obligations[0].obligationType = "Assessment";
  const result = parseAnalysisResponse(JSON.stringify(bad));
  assert.equal(result.obligations[0]?.obligationType, "assessment");
});

// --- parseRelativeDeadline: deterministic date computation ---

test("parseRelativeDeadline computes a date for 'within N days'", () => {
  const effectiveDate = new Date("2026-01-01T00:00:00Z");
  const result = parseRelativeDeadline("within 90 days of the effective date", effectiveDate);
  assert.equal(result?.toISOString(), "2026-04-01T00:00:00.000Z");
});

test("parseRelativeDeadline computes a date for 'within N months'", () => {
  const effectiveDate = new Date("2026-01-01T00:00:00Z");
  const result = parseRelativeDeadline("within 6 months", effectiveDate);
  assert.equal(result?.toISOString(), "2026-07-01T00:00:00.000Z");
});

test("parseRelativeDeadline computes a date for 'within N years'", () => {
  const effectiveDate = new Date("2026-01-01T00:00:00Z");
  const result = parseRelativeDeadline("within 1 year", effectiveDate);
  assert.equal(result?.toISOString(), "2027-01-01T00:00:00.000Z");
});

test("parseRelativeDeadline returns null when there's no description", () => {
  assert.equal(parseRelativeDeadline(null, new Date()), null);
});

test("parseRelativeDeadline returns null when there's no effectiveDate to compute from", () => {
  assert.equal(parseRelativeDeadline("within 90 days", null), null);
});

test("parseRelativeDeadline returns null for prose it doesn't confidently recognize, rather than guess", () => {
  assert.equal(parseRelativeDeadline("by the end of the next fiscal quarter", new Date()), null);
  assert.equal(parseRelativeDeadline("as soon as practicable", new Date()), null);
});

// --- analyzeComplianceUpdate / analyzeUnanalyzedUpdates ---

async function seedAnalyzableUpdate(repo: FakeComplianceRepository, externalId = "a", title = "AI Risk Rule") {
  const source = await registerComplianceSource(repo, {
    name: "Test Source",
    jurisdiction: "US-Federal",
    frameworkTags: ["NIST_AI_RMF"],
    sourceType: "rss",
    url: "https://example.gov/feed.xml",
  });
  await ingestComplianceItems(repo, source, [
    { externalId, title, summary: "s", url: `https://example.gov/${externalId}`, publishedAt: null },
  ]);
  const stored = await repo.getUpdateBySourceAndExternalId(source.id, externalId);
  return stored!;
}

test("analyzeComplianceUpdate calls the AI provider and persists the parsed analysis", async () => {
  const repo = new FakeComplianceRepository();
  const provider = new FakeAIProvider();
  provider.nextResponse = { content: VALID_RESPONSE, tokensUsed: 200, model: "claude-sonnet-5" };
  const update = await seedAnalyzableUpdate(repo);

  const analysis = await analyzeComplianceUpdate(repo, provider, update.id);

  assert.equal(analysis.updateId, update.id);
  assert.equal(analysis.isAiRelated, true);
  assert.equal(analysis.model, "claude-sonnet-5");
  const stored = await repo.getAnalysisForUpdate(update.id);
  assert.equal(stored?.riskLevel, "high");
});

test("analyzeComplianceUpdate extracts and stores obligations alongside the analysis", async () => {
  const repo = new FakeComplianceRepository();
  const provider = new FakeAIProvider();
  provider.nextResponse = { content: VALID_RESPONSE, tokensUsed: 200, model: "claude-sonnet-5" };
  const update = await seedAnalyzableUpdate(repo);

  await analyzeComplianceUpdate(repo, provider, update.id);

  const obligations = await repo.listObligationsForUpdate(update.id);
  assert.equal(obligations.length, 1);
  assert.equal(obligations[0]?.description, "Conduct an annual AI risk assessment");
  assert.equal(obligations[0]?.obligationType, "assessment");
  assert.deepEqual(obligations[0]?.industries, ["healthcare"]);
  assert.equal(obligations[0]?.updateId, update.id);
});

test("analyzeComplianceUpdate computes deadlineDate from the update's own effectiveDate when the obligation's deadline description matches a recognized pattern", async () => {
  const repo = new FakeComplianceRepository();
  const provider = new FakeAIProvider();
  provider.nextResponse = { content: VALID_RESPONSE, tokensUsed: 200, model: "claude-sonnet-5" };

  const source = await registerComplianceSource(repo, {
    name: "Test Source",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/feed.xml",
  });
  const effectiveDate = new Date("2026-01-01T00:00:00Z");
  await ingestComplianceItems(repo, source, [
    { externalId: "a", title: "Rule", summary: "s", url: "https://example.gov/a", publishedAt: null, effectiveDate },
  ]);
  const update = (await repo.getUpdateBySourceAndExternalId(source.id, "a"))!;

  await analyzeComplianceUpdate(repo, provider, update.id);

  const obligations = await repo.listObligationsForUpdate(update.id);
  assert.equal(obligations[0]?.deadlineDate?.toISOString(), "2026-04-01T00:00:00.000Z", "90 days after the Jan 1 effective date");
});

test("analyzeComplianceUpdate leaves deadlineDate null when the update has no effectiveDate, even with a recognized deadline description", async () => {
  const repo = new FakeComplianceRepository();
  const provider = new FakeAIProvider();
  provider.nextResponse = { content: VALID_RESPONSE, tokensUsed: 200, model: "claude-sonnet-5" };
  const update = await seedAnalyzableUpdate(repo); // no effectiveDate

  await analyzeComplianceUpdate(repo, provider, update.id);

  const obligations = await repo.listObligationsForUpdate(update.id);
  assert.equal(obligations[0]?.deadlineDate, null);
  assert.equal(obligations[0]?.deadlineDescription, "within 90 days of the effective date", "the prose is still kept even when it can't be computed into a date");
});

test("analyzeComplianceUpdate sends the update's title and content/summary to the provider", async () => {
  const repo = new FakeComplianceRepository();
  const provider = new FakeAIProvider();
  provider.nextResponse = { content: VALID_RESPONSE, tokensUsed: 200, model: "claude-sonnet-5" };
  const update = await seedAnalyzableUpdate(repo);

  await analyzeComplianceUpdate(repo, provider, update.id);

  const call = provider.calls[0];
  assert.equal(call?.length, 2, "system + user message");
  assert.equal(call?.[0]?.role, "system");
  assert.match(call?.[1]?.content ?? "", /AI Risk Rule/);
});

test("analyzeComplianceUpdate throws not_found for an unknown update, and never calls the provider", async () => {
  const repo = new FakeComplianceRepository();
  const provider = new FakeAIProvider();

  await assert.rejects(
    () => analyzeComplianceUpdate(repo, provider, "ghost-update"),
    (err: unknown) => err instanceof ComplianceAnalysisError && err.code === "update_not_found",
  );
  assert.equal(provider.calls.length, 0);
});

test("analyzeComplianceUpdate propagates a malformed AI response as ComplianceAnalysisError rather than storing garbage", async () => {
  const repo = new FakeComplianceRepository();
  const provider = new FakeAIProvider();
  provider.nextResponse = { content: "not json", tokensUsed: 10, model: "claude-sonnet-5" };
  const update = await seedAnalyzableUpdate(repo);

  await assert.rejects(
    () => analyzeComplianceUpdate(repo, provider, update.id),
    (err: unknown) => err instanceof ComplianceAnalysisError && err.code === "invalid_ai_response",
  );
  assert.equal(await repo.getAnalysisForUpdate(update.id), null, "nothing should be stored on a rejected response");
  assert.deepEqual(await repo.listObligationsForUpdate(update.id), [], "no obligations should be stored either");
});

test("analyzeComplianceUpdate replaces prior analysis AND prior obligations for the same update rather than versioning alongside them", async () => {
  const repo = new FakeComplianceRepository();
  const provider = new FakeAIProvider();
  provider.nextResponse = { content: VALID_RESPONSE, tokensUsed: 200, model: "claude-sonnet-5" };
  const update = await seedAnalyzableUpdate(repo);

  await analyzeComplianceUpdate(repo, provider, update.id);
  const updatedResponse = JSON.parse(VALID_RESPONSE);
  updatedResponse.riskLevel = "low";
  updatedResponse.obligations = []; // second analysis finds no obligations at all
  provider.nextResponse = { content: JSON.stringify(updatedResponse), tokensUsed: 200, model: "claude-sonnet-5" };
  await analyzeComplianceUpdate(repo, provider, update.id);

  const stored = await repo.getAnalysisForUpdate(update.id);
  assert.equal(stored?.riskLevel, "low", "second analysis should replace the first, not coexist with it");
  assert.equal(repo.analyses.size, 1);
  assert.deepEqual(await repo.listObligationsForUpdate(update.id), [], "obligations should also be replaced, not accumulated");
});

test("analyzeUnanalyzedUpdates processes only updates without an existing analysis", async () => {
  const repo = new FakeComplianceRepository();
  const provider = new FakeAIProvider();
  provider.nextResponse = { content: VALID_RESPONSE, tokensUsed: 200, model: "claude-sonnet-5" };
  const update = await seedAnalyzableUpdate(repo);
  await analyzeComplianceUpdate(repo, provider, update.id); // already analyzed

  const summary = await analyzeUnanalyzedUpdates(repo, provider, 10);

  assert.deepEqual(summary, { analyzed: 0, failed: 0 }, "the only update was already analyzed, nothing left to do");
});

test("analyzeUnanalyzedUpdates analyzes a genuinely unanalyzed update", async () => {
  const repo = new FakeComplianceRepository();
  const provider = new FakeAIProvider();
  provider.nextResponse = { content: VALID_RESPONSE, tokensUsed: 200, model: "claude-sonnet-5" };
  await seedAnalyzableUpdate(repo);

  const summary = await analyzeUnanalyzedUpdates(repo, provider, 10);

  assert.deepEqual(summary, { analyzed: 1, failed: 0 });
});

test("analyzeUnanalyzedUpdates counts every item as failed, and doesn't throw, when the provider itself errors on every call", async () => {
  const repo = new FakeComplianceRepository();
  const source = await registerComplianceSource(repo, {
    name: "Test Source",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/feed.xml",
  });
  await ingestComplianceItems(repo, source, [
    { externalId: "a", title: "Rule A", summary: "s", url: "https://example.gov/a", publishedAt: null },
    { externalId: "b", title: "Rule B", summary: "s", url: "https://example.gov/b", publishedAt: null },
  ]);
  const provider = new FakeAIProvider();
  provider.shouldThrow = new Error("provider unavailable");

  const summary = await analyzeUnanalyzedUpdates(repo, provider, 10);

  assert.deepEqual(summary, { analyzed: 0, failed: 2 }, "both items should be attempted and counted as failed, not stop after the first");
});

test("analyzeUnanalyzedUpdates respects the limit", async () => {
  const repo = new FakeComplianceRepository();
  const source = await registerComplianceSource(repo, {
    name: "Test Source",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/feed.xml",
  });
  await ingestComplianceItems(repo, source, [
    { externalId: "a", title: "Rule A", summary: "s", url: "https://example.gov/a", publishedAt: null },
    { externalId: "b", title: "Rule B", summary: "s", url: "https://example.gov/b", publishedAt: null },
    { externalId: "c", title: "Rule C", summary: "s", url: "https://example.gov/c", publishedAt: null },
  ]);
  const provider = new FakeAIProvider();
  provider.nextResponse = { content: VALID_RESPONSE, tokensUsed: 200, model: "claude-sonnet-5" };

  const summary = await analyzeUnanalyzedUpdates(repo, provider, 2);

  assert.deepEqual(summary, { analyzed: 2, failed: 0 });
});

// --- knowledge queries: listObligationsByIndustry / listUpcomingObligations ---

test("listObligationsByIndustry finds obligations that apply to the given industry, ignoring ones that don't", async () => {
  const repo = new FakeComplianceRepository();
  const provider = new FakeAIProvider();
  provider.nextResponse = { content: VALID_RESPONSE, tokensUsed: 200, model: "claude-sonnet-5" }; // industries: ["healthcare"]
  const update = await seedAnalyzableUpdate(repo);
  await analyzeComplianceUpdate(repo, provider, update.id);

  const healthcare = await repo.listObligationsByIndustry("healthcare");
  const finance = await repo.listObligationsByIndustry("finance");

  assert.equal(healthcare.length, 1);
  assert.equal(finance.length, 0);
});

test("listUpcomingObligations finds obligations with a computed deadline on or before the given date, ignoring ones without a computed deadline", async () => {
  const repo = new FakeComplianceRepository();
  const provider = new FakeAIProvider();
  const source = await registerComplianceSource(repo, {
    name: "Test Source",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/feed.xml",
  });
  const effectiveDate = new Date("2026-01-01T00:00:00Z");
  await ingestComplianceItems(repo, source, [
    { externalId: "a", title: "Rule", summary: "s", url: "https://example.gov/a", publishedAt: null, effectiveDate },
  ]);
  const update = (await repo.getUpdateBySourceAndExternalId(source.id, "a"))!;
  provider.nextResponse = { content: VALID_RESPONSE, tokensUsed: 200, model: "claude-sonnet-5" }; // deadline: 90 days after effectiveDate = 2026-04-01
  await analyzeComplianceUpdate(repo, provider, update.id);

  const beforeDeadline = await repo.listUpcomingObligations(new Date("2026-03-01T00:00:00Z"));
  const afterDeadline = await repo.listUpcomingObligations(new Date("2026-05-01T00:00:00Z"));

  assert.equal(beforeDeadline.length, 0, "the computed deadline (April 1) hasn't happened yet by March 1");
  assert.equal(afterDeadline.length, 1, "by May 1, the April 1 deadline should show up as upcoming/passed");
});
