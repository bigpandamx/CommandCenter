import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ComplianceRuleError,
  createRule,
  listRules,
  linkUpdateToRule,
  unlinkUpdateFromRule,
  getRuleHistory,
  getCurrentVersion,
  addRelatedRule,
  removeRelatedRule,
  listRelatedRules,
} from "../src/ruleService.js";
import { FakeComplianceRepository } from "../test/fakeRepository.js";
import { registerComplianceSource } from "../src/sourceManagement.js";
import { ingestComplianceItems } from "../src/ingestion.js";
import type { NormalizedComplianceItem } from "../src/types.js";

async function seedUpdate(
  repo: FakeComplianceRepository,
  title: string,
  publishedAt: Date | null,
  documentType: NormalizedComplianceItem["documentType"] = "new_law",
) {
  const source = await registerComplianceSource(repo, {
    name: `Source for ${title}`,
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: `https://example.gov/${randomUUID()}.xml`,
  });
  await ingestComplianceItems(repo, source, [
    { externalId: "a", title, summary: "s", url: `https://example.gov/${randomUUID()}`, publishedAt, country: "US", state: null, documentType },
  ]);
  return (await repo.getUpdateBySourceAndExternalId(source.id, "a"))!;
}

test("createRule rejects an invalid key format", async () => {
  const repo = new FakeComplianceRepository();
  await assert.rejects(
    () => createRule(repo, { key: "AI Transparency!", name: "x", description: "x" }),
    (err: unknown) => err instanceof ComplianceRuleError && err.code === "invalid_key",
  );
});

test("createRule rejects a duplicate key", async () => {
  const repo = new FakeComplianceRepository();
  await createRule(repo, { key: "ai-transparency-rule", name: "AI Transparency Rule", description: "x" });
  await assert.rejects(
    () => createRule(repo, { key: "ai-transparency-rule", name: "Again", description: "x" }),
    (err: unknown) => err instanceof ComplianceRuleError && err.code === "duplicate_key",
  );
});

test("linkUpdateToRule throws rule_not_found / update_not_found appropriately", async () => {
  const repo = new FakeComplianceRepository();
  const rule = await createRule(repo, { key: "ai-transparency-rule", name: "AI Transparency Rule", description: "x" });
  const update = await seedUpdate(repo, "Original Rule", new Date("2026-01-01"));

  await assert.rejects(
    () => linkUpdateToRule(repo, update.id, "ghost-rule"),
    (err: unknown) => err instanceof ComplianceRuleError && err.code === "rule_not_found",
  );
  await assert.rejects(
    () => linkUpdateToRule(repo, "ghost-update", rule.key),
    (err: unknown) => err instanceof ComplianceRuleError && err.code === "update_not_found",
  );
});

test("the worked example: original rule, correction, and guidance all link into one rule's History, oldest first", async () => {
  const repo = new FakeComplianceRepository();
  const rule = await createRule(repo, { key: "ai-transparency-rule", name: "AI Transparency Rule", description: "x" });

  const original = await seedUpdate(repo, "AI Transparency Rule", new Date("2026-01-01"), "new_law");
  const correction = await seedUpdate(repo, "Correction to AI Transparency Rule", new Date("2026-01-08"), "amendment");
  const guidance = await seedUpdate(repo, "Implementation Guidance", new Date("2026-01-15"), "guidance");

  await linkUpdateToRule(repo, original.id, rule.key);
  await linkUpdateToRule(repo, correction.id, rule.key);
  await linkUpdateToRule(repo, guidance.id, rule.key);

  const history = await getRuleHistory(repo, rule.key);
  assert.deepEqual(
    history.map((u) => u.title),
    ["AI Transparency Rule", "Correction to AI Transparency Rule", "Implementation Guidance"],
  );
});

test("getCurrentVersion returns the most recently PUBLISHED update, not the most recently linked", async () => {
  const repo = new FakeComplianceRepository();
  const rule = await createRule(repo, { key: "ai-transparency-rule", name: "AI Transparency Rule", description: "x" });

  const older = await seedUpdate(repo, "Original Rule", new Date("2026-01-01"));
  const newer = await seedUpdate(repo, "Correction", new Date("2026-01-08"));

  await linkUpdateToRule(repo, newer.id, rule.key);
  await linkUpdateToRule(repo, older.id, rule.key);

  const current = await getCurrentVersion(repo, rule.key);
  assert.equal(current!.title, "Correction");
});

test("getCurrentVersion returns null for a rule with no linked updates", async () => {
  const repo = new FakeComplianceRepository();
  const rule = await createRule(repo, { key: "empty-rule", name: "Empty Rule", description: "x" });
  assert.equal(await getCurrentVersion(repo, rule.key), null);
});

test("an update with no publishedAt never displaces a dated update as current", async () => {
  const repo = new FakeComplianceRepository();
  const rule = await createRule(repo, { key: "ai-transparency-rule", name: "AI Transparency Rule", description: "x" });

  const dated = await seedUpdate(repo, "Dated", new Date("2026-01-01"));
  const undated = await seedUpdate(repo, "Undated", null);

  await linkUpdateToRule(repo, dated.id, rule.key);
  await linkUpdateToRule(repo, undated.id, rule.key);

  const current = await getCurrentVersion(repo, rule.key);
  assert.equal(current!.title, "Dated");
});

test("unlinkUpdateFromRule removes it from the rule's history", async () => {
  const repo = new FakeComplianceRepository();
  const rule = await createRule(repo, { key: "ai-transparency-rule", name: "AI Transparency Rule", description: "x" });
  const update = await seedUpdate(repo, "Original Rule", new Date("2026-01-01"));

  await linkUpdateToRule(repo, update.id, rule.key);
  assert.equal((await getRuleHistory(repo, rule.key)).length, 1);

  await unlinkUpdateFromRule(repo, update.id);
  assert.equal((await getRuleHistory(repo, rule.key)).length, 0);
});

test("related rules: added, listed (resolved to full objects), and removed", async () => {
  const repo = new FakeComplianceRepository();
  const ruleA = await createRule(repo, { key: "ai-transparency-rule", name: "AI Transparency Rule", description: "x" });
  const ruleB = await createRule(repo, { key: "ai-risk-management", name: "AI Risk Management Framework", description: "x" });

  await addRelatedRule(repo, ruleA.key, ruleB.key);
  const related = await listRelatedRules(repo, ruleA.key);
  assert.equal(related.length, 1);
  assert.equal(related[0]!.key, "ai-risk-management");

  await removeRelatedRule(repo, ruleA.key, ruleB.key);
  assert.equal((await listRelatedRules(repo, ruleA.key)).length, 0);
});

test("a rule cannot relate to itself", async () => {
  const repo = new FakeComplianceRepository();
  const rule = await createRule(repo, { key: "ai-transparency-rule", name: "AI Transparency Rule", description: "x" });
  await assert.rejects(
    () => addRelatedRule(repo, rule.key, rule.key),
    (err: unknown) => err instanceof ComplianceRuleError && err.code === "invalid_key",
  );
});

test("listRules returns every created rule", async () => {
  const repo = new FakeComplianceRepository();
  await createRule(repo, { key: "rule-a", name: "A", description: "x" });
  await createRule(repo, { key: "rule-b", name: "B", description: "x" });
  const rules = await listRules(repo);
  assert.equal(rules.length, 2);
});
