import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  RuleInterpretationError,
  parseInterpretationResponse,
  synthesizeRuleInterpretation,
  isInterpretationStale,
} from "../src/ruleInterpretation.js";
import { createRule, linkUpdateToRule } from "../src/ruleService.js";
import { FakeComplianceRepository } from "../test/fakeRepository.js";
import { FakeAIProvider } from "../../../Customer-Connections/AIChat/test/fakeAIProvider.js";
import { registerComplianceSource } from "../src/sourceManagement.js";
import { ingestComplianceItems } from "../src/ingestion.js";

async function seedUpdate(repo: FakeComplianceRepository, title: string, publishedAt: Date | null) {
  const source = await registerComplianceSource(repo, {
    name: `Source for ${title}`,
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: `https://example.gov/${randomUUID()}.xml`,
  });
  await ingestComplianceItems(repo, source, [
    { externalId: "a", title, summary: "s", url: `https://example.gov/${randomUUID()}`, publishedAt, country: "US", state: null },
  ]);
  return (await repo.getUpdateBySourceAndExternalId(source.id, "a"))!;
}

function validResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    interpretation: "The rule now requires disclosure within 60 days, per the correction.",
    keyChanges: ["The correction narrowed the deadline from 90 to 60 days"],
    riskLevel: "high",
    actionItems: ["Update disclosure timelines to 60 days"],
    ...overrides,
  });
}

test("parseInterpretationResponse rejects malformed JSON", () => {
  assert.throws(
    () => parseInterpretationResponse("not json"),
    (err: unknown) => err instanceof RuleInterpretationError && err.code === "invalid_ai_response",
  );
});

test("parseInterpretationResponse rejects an invalid riskLevel", () => {
  assert.throws(
    () => parseInterpretationResponse(validResponse({ riskLevel: "extreme" })),
    (err: unknown) => err instanceof RuleInterpretationError && err.code === "invalid_ai_response",
  );
});

test("parseInterpretationResponse strips markdown code fences", () => {
  const parsed = parseInterpretationResponse("```json\n" + validResponse() + "\n```");
  assert.equal(parsed.riskLevel, "high");
});

test("synthesizeRuleInterpretation throws empty_history for a rule with no linked updates", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const rule = await createRule(repo, { key: "empty-rule", name: "Empty Rule", description: "x" });

  await assert.rejects(
    () => synthesizeRuleInterpretation(repo, aiProvider, rule.key),
    (err: unknown) => err instanceof RuleInterpretationError && err.code === "empty_history",
  );
});

test("synthesizeRuleInterpretation throws for an unknown rule", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  await assert.rejects(() => synthesizeRuleInterpretation(repo, aiProvider, "ghost-rule"), /ghost-rule/);
});

test("the worked example: synthesizes across the rule's full history and persists basedOnUpdateCount", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const rule = await createRule(repo, { key: "ai-transparency-rule", name: "AI Transparency Rule", description: "x" });

  const original = await seedUpdate(repo, "AI Transparency Rule", new Date("2026-01-01"));
  const correction = await seedUpdate(repo, "Correction to AI Transparency Rule", new Date("2026-01-08"));
  await linkUpdateToRule(repo, original.id, rule.key);
  await linkUpdateToRule(repo, correction.id, rule.key);

  aiProvider.nextResponse = { content: validResponse(), tokensUsed: 500, model: "claude-sonnet-5" };

  const interpretation = await synthesizeRuleInterpretation(repo, aiProvider, rule.key);

  assert.equal(interpretation.basedOnUpdateCount, 2);
  assert.equal(interpretation.currentRiskLevel, "high");
  assert.deepEqual(interpretation.currentActionItems, ["Update disclosure timelines to 60 days"]);
  assert.equal(interpretation.keyChanges.length, 1);

  const promptSent = aiProvider.calls[0]![1]!.content;
  assert.ok(promptSent.includes("AI Transparency Rule"));
  assert.ok(promptSent.includes("Correction to AI Transparency Rule"));
});

test("interpretations are append-only -- regenerating adds a new row, doesn't replace the prior one", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const rule = await createRule(repo, { key: "ai-transparency-rule", name: "AI Transparency Rule", description: "x" });
  const update = await seedUpdate(repo, "AI Transparency Rule", new Date("2026-01-01"));
  await linkUpdateToRule(repo, update.id, rule.key);

  aiProvider.nextResponse = { content: validResponse(), tokensUsed: 500, model: "claude-sonnet-5" };
  await synthesizeRuleInterpretation(repo, aiProvider, rule.key);
  await synthesizeRuleInterpretation(repo, aiProvider, rule.key);

  assert.equal(repo.ruleInterpretations.filter((i) => i.ruleId === rule.id).length, 2);
});

test("isInterpretationStale reflects the most recent synthesis correctly", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const rule = await createRule(repo, { key: "ai-transparency-rule", name: "AI Transparency Rule", description: "x" });
  const update = await seedUpdate(repo, "AI Transparency Rule", new Date("2026-01-01"));
  await linkUpdateToRule(repo, update.id, rule.key);

  aiProvider.nextResponse = { content: validResponse(), tokensUsed: 500, model: "claude-sonnet-5" };
  await synthesizeRuleInterpretation(repo, aiProvider, rule.key);

  assert.equal(await isInterpretationStale(repo, rule.key), false);
});

test("isInterpretationStale is true once the rule's history grows past what the latest interpretation was based on", async () => {
  const repo = new FakeComplianceRepository();
  const aiProvider = new FakeAIProvider();
  const rule = await createRule(repo, { key: "ai-transparency-rule", name: "AI Transparency Rule", description: "x" });
  const original = await seedUpdate(repo, "AI Transparency Rule", new Date("2026-01-01"));
  await linkUpdateToRule(repo, original.id, rule.key);

  aiProvider.nextResponse = { content: validResponse(), tokensUsed: 500, model: "claude-sonnet-5" };
  await synthesizeRuleInterpretation(repo, aiProvider, rule.key);
  assert.equal(await isInterpretationStale(repo, rule.key), false);

  const correction = await seedUpdate(repo, "Correction to AI Transparency Rule", new Date("2026-01-08"));
  await linkUpdateToRule(repo, correction.id, rule.key);

  assert.equal(await isInterpretationStale(repo, rule.key), true);
});

test("isInterpretationStale is false for a rule never interpreted and with no history at all", async () => {
  const repo = new FakeComplianceRepository();
  const rule = await createRule(repo, { key: "empty-rule", name: "Empty Rule", description: "x" });
  assert.equal(await isInterpretationStale(repo, rule.key), false);
});

test("isInterpretationStale is true for a rule with history but never interpreted", async () => {
  const repo = new FakeComplianceRepository();
  const rule = await createRule(repo, { key: "ai-transparency-rule", name: "AI Transparency Rule", description: "x" });
  const update = await seedUpdate(repo, "AI Transparency Rule", new Date("2026-01-01"));
  await linkUpdateToRule(repo, update.id, rule.key);

  assert.equal(await isInterpretationStale(repo, rule.key), true);
});
