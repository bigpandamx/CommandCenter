import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuditComplianceSourcesHandler } from "../src/complianceAgent.js";
import { FakeComplianceRepository } from "../../Compliance/test/fakeRepository.js";
import { registerComplianceSource } from "../../Compliance/src/sourceManagement.js";

test("auditComplianceSources finds nothing when every active source is healthy", async () => {
  const repo = new FakeComplianceRepository();
  await registerComplianceSource(repo, {
    name: "Federal Register",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "json_api",
    url: "https://www.federalregister.gov/api/v1/documents.json",
  });

  const handler = createAuditComplianceSourcesHandler(repo);
  const result = await handler({});

  assert.equal(result.data.failingCount, 0);
  assert.deepEqual(result.recommendations, []);
});

test("auditComplianceSources flags a source currently in an error state", async () => {
  const repo = new FakeComplianceRepository();
  const source = await registerComplianceSource(repo, {
    name: "Flaky Source",
    jurisdiction: "EU",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.eu/feed.xml",
  });
  const stored = await repo.getSourceById(source.id);
  await repo.updateSource({ ...stored!, lastFetchStatus: "error", lastFetchError: "HTTP 503" });

  const handler = createAuditComplianceSourcesHandler(repo);
  const result = await handler({});

  assert.equal(result.data.failingCount, 1);
  assert.deepEqual(result.data.failingSourceIds, [source.id]);
  assert.match(result.recommendations[0] ?? "", /Flaky Source/);
  assert.match(result.recommendations[0] ?? "", /HTTP 503/);
});

test("auditComplianceSources ignores an inactive source even if it's in an error state", async () => {
  const repo = new FakeComplianceRepository();
  const source = await registerComplianceSource(repo, {
    name: "Deactivated Source",
    jurisdiction: "Global",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.com/feed.xml",
  });
  const stored = await repo.getSourceById(source.id);
  await repo.updateSource({ ...stored!, lastFetchStatus: "error", isActive: false });

  const handler = createAuditComplianceSourcesHandler(repo);
  const result = await handler({});

  assert.equal(result.data.failingCount, 0);
});
