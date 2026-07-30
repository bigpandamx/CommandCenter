import { test } from "node:test";
import assert from "node:assert/strict";
import { registerComplianceSource } from "../src/sourceManagement.js";
import { ingestComplianceItems, parseUsJurisdiction } from "../src/ingestion.js";
import { FakeComplianceRepository } from "./fakeRepository.js";
import type { NormalizedComplianceItem } from "../src/types.js";

async function seedSource(repo: FakeComplianceRepository) {
  return registerComplianceSource(repo, {
    name: "Test Source",
    jurisdiction: "US-Federal",
    frameworkTags: ["NIST_AI_RMF"],
    sourceType: "rss",
    url: "https://example.gov/feed.xml",
  });
}

test("ingestComplianceItems inserts new items, tags them with the source's frameworkTags, and falls back to the source's jurisdiction for country/state", async () => {
  const repo = new FakeComplianceRepository();
  const source = await seedSource(repo); // jurisdiction: "US-Federal"
  const items: NormalizedComplianceItem[] = [
    { externalId: "a", title: "Rule A", summary: "s", url: "https://example.gov/a", publishedAt: null },
  ];

  const summary = await ingestComplianceItems(repo, source, items);

  assert.deepEqual(summary, { inserted: 1, duplicate: 0 });
  const stored = await repo.getUpdateBySourceAndExternalId(source.id, "a");
  assert.equal(stored?.country, "US", "item didn't declare a country -- falls back to the source's US-Federal jurisdiction");
  assert.equal(stored?.state, null, "federal -- nationwide, not state-specific");
  assert.deepEqual(stored?.frameworkTags, ["NIST_AI_RMF"]);
  assert.equal(stored?.documentType, "news", "defaults to 'news' when the adapter didn't classify it");
});

test("ingestComplianceItems prefers the item's own country/state over the source's fallback when the item declares one", async () => {
  const repo = new FakeComplianceRepository();
  const source = await seedSource(repo); // jurisdiction: "US-Federal" -- would fall back to country "US", state null
  const items: NormalizedComplianceItem[] = [
    { externalId: "a", title: "State Rule", summary: null, url: "https://example.gov/a", publishedAt: null, country: "DE", state: null },
  ];

  await ingestComplianceItems(repo, source, items);

  const stored = await repo.getUpdateBySourceAndExternalId(source.id, "a");
  assert.equal(stored?.country, "DE", "the item's own determination should win over the source-level fallback");
});

test("ingestComplianceItems passes through content, effectiveDate, and industries when the adapter provides them", async () => {
  const repo = new FakeComplianceRepository();
  const source = await seedSource(repo);
  const effectiveDate = new Date("2026-10-01T00:00:00Z");
  await ingestComplianceItems(repo, source, [
    {
      externalId: "a",
      title: "Rule A",
      summary: "short",
      content: "the full text of the rule",
      url: "https://example.gov/a",
      publishedAt: null,
      effectiveDate,
      industries: ["ai", "healthcare"],
    },
  ]);

  const stored = await repo.getUpdateBySourceAndExternalId(source.id, "a");
  assert.equal(stored?.content, "the full text of the rule");
  assert.equal(stored?.effectiveDate?.toISOString(), effectiveDate.toISOString());
  assert.deepEqual(stored?.industries, ["ai", "healthcare"]);
});

test("ingestComplianceItems defaults content to null, effectiveDate to null, and industries to [] when the adapter doesn't provide them -- never fabricated", async () => {
  const repo = new FakeComplianceRepository();
  const source = await seedSource(repo);
  await ingestComplianceItems(repo, source, [
    { externalId: "a", title: "Rule A", summary: "s", url: "https://example.gov/a", publishedAt: null },
  ]);

  const stored = await repo.getUpdateBySourceAndExternalId(source.id, "a");
  assert.equal(stored?.content, null);
  assert.equal(stored?.effectiveDate, null);
  assert.deepEqual(stored?.industries, []);
});

test("ingestComplianceItems is idempotent across repeated runs (same externalId not re-inserted)", async () => {
  const repo = new FakeComplianceRepository();
  const source = await seedSource(repo);
  const items: NormalizedComplianceItem[] = [
    { externalId: "a", title: "Rule A", summary: null, url: "https://example.gov/a", publishedAt: null },
  ];

  await ingestComplianceItems(repo, source, items);
  const secondRun = await ingestComplianceItems(repo, source, items);

  assert.deepEqual(secondRun, { inserted: 0, duplicate: 1 });
  assert.equal(repo.updates.size, 1);
});

test("ingestComplianceItems scopes dedup to the source -- the same externalId from two different sources are both kept", async () => {
  const repo = new FakeComplianceRepository();
  const sourceA = await seedSource(repo);
  const sourceB = await registerComplianceSource(repo, {
    name: "Other Source",
    jurisdiction: "EU",
    frameworkTags: ["EU_AI_ACT"],
    sourceType: "atom",
    url: "https://example.eu/feed.xml",
  });
  const items: NormalizedComplianceItem[] = [
    { externalId: "shared-id", title: "Title", summary: null, url: "https://example.com/x", publishedAt: null },
  ];

  await ingestComplianceItems(repo, sourceA, items);
  const result = await ingestComplianceItems(repo, sourceB, items);

  assert.deepEqual(result, { inserted: 1, duplicate: 0 });
  assert.equal(repo.updates.size, 2);
});

test("ingestComplianceItems respects an adapter-provided documentType instead of defaulting to 'news'", async () => {
  const repo = new FakeComplianceRepository();
  const source = await seedSource(repo);
  await ingestComplianceItems(repo, source, [
    { externalId: "a", title: "Final Rule", summary: null, url: "https://example.gov/a", publishedAt: null, documentType: "new_law" },
  ]);
  const stored = await repo.getUpdateBySourceAndExternalId(source.id, "a");
  assert.equal(stored?.documentType, "new_law");
});

test("parseUsJurisdiction recognizes 'US-Federal' as nationwide", () => {
  assert.deepEqual(parseUsJurisdiction("US-Federal"), { country: "US", state: null });
});

test("parseUsJurisdiction recognizes 'US-XX' as a specific state", () => {
  assert.deepEqual(parseUsJurisdiction("US-CA"), { country: "US", state: "CA" });
  assert.deepEqual(parseUsJurisdiction("US-NY"), { country: "US", state: "NY" });
});

test("parseUsJurisdiction returns nulls for anything else, rather than guess a mapping", () => {
  assert.deepEqual(parseUsJurisdiction("EU"), { country: null, state: null });
  assert.deepEqual(parseUsJurisdiction("Global"), { country: null, state: null });
  assert.deepEqual(parseUsJurisdiction("UK"), { country: null, state: null });
  assert.deepEqual(parseUsJurisdiction("US"), { country: null, state: null }, "not the recognized 'US-Federal'/'US-XX' shape");
});
