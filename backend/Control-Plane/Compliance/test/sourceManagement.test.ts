import { test } from "node:test";
import assert from "node:assert/strict";
import {
  registerComplianceSource,
  deactivateComplianceSource,
  activateComplianceSource,
  updateSourceSchedule,
  addManualComplianceUpdate,
  recordFetchOutcome,
  ComplianceSourceError,
} from "../src/sourceManagement.js";
import { runComplianceIngestion } from "../src/scheduler.js";
import { FakeComplianceRepository } from "./fakeRepository.js";

test("registerComplianceSource creates an active source in 'never_run' fetch status", async () => {
  const repo = new FakeComplianceRepository();
  const source = await registerComplianceSource(repo, {
    name: "Federal Register - AI Rules",
    jurisdiction: "US-Federal",
    frameworkTags: ["NIST_AI_RMF"],
    sourceType: "json_api",
    url: "https://www.federalregister.gov/api/v1/documents.json?conditions[term]=artificial+intelligence",
  });

  assert.equal(source.isActive, true);
  assert.equal(source.lastFetchStatus, "never_run");
  assert.equal(source.lastFetchedAt, null);
});

test("registerComplianceSource rejects a non-http(s) URL", async () => {
  const repo = new FakeComplianceRepository();
  await assert.rejects(
    () =>
      registerComplianceSource(repo, {
        name: "Bad Source",
        jurisdiction: "Global",
        frameworkTags: [],
        sourceType: "rss",
        url: "not-a-url",
      }),
    (err: unknown) => err instanceof ComplianceSourceError && err.code === "invalid_url",
  );
});

test("registerComplianceSource rejects a non-http(s) scheme like ftp://", async () => {
  const repo = new FakeComplianceRepository();
  await assert.rejects(
    () =>
      registerComplianceSource(repo, {
        name: "FTP Source",
        jurisdiction: "Global",
        frameworkTags: [],
        sourceType: "rss",
        url: "ftp://example.com/feed.xml",
      }),
    (err: unknown) => err instanceof ComplianceSourceError && err.code === "invalid_url",
  );
});

test("deactivateComplianceSource marks the source inactive", async () => {
  const repo = new FakeComplianceRepository();
  const source = await registerComplianceSource(repo, {
    name: "Source",
    jurisdiction: "EU",
    frameworkTags: ["EU_AI_ACT"],
    sourceType: "rss",
    url: "https://example.eu/feed.xml",
  });

  await deactivateComplianceSource(repo, source.id);

  const stored = await repo.getSourceById(source.id);
  assert.equal(stored?.isActive, false);
});

test("deactivateComplianceSource throws for an unknown source", async () => {
  const repo = new FakeComplianceRepository();
  await assert.rejects(
    () => deactivateComplianceSource(repo, "ghost-source"),
    (err: unknown) => err instanceof ComplianceSourceError && err.code === "source_not_found",
  );
});

test("recordFetchOutcome updates lastFetchedAt/lastFetchStatus on success and clears any prior error", async () => {
  const repo = new FakeComplianceRepository();
  const source = await registerComplianceSource(repo, {
    name: "Source",
    jurisdiction: "Global",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.com/feed.xml",
  });
  await recordFetchOutcome(repo, source.id, { status: "error", error: "timeout" });
  const now = new Date("2026-07-20T12:00:00Z");

  await recordFetchOutcome(repo, source.id, { status: "success" }, now);

  const stored = await repo.getSourceById(source.id);
  assert.equal(stored?.lastFetchStatus, "success");
  assert.equal(stored?.lastFetchedAt?.toISOString(), now.toISOString());
  assert.equal(stored?.lastFetchError, null);
});

test("recordFetchOutcome stores the error message on failure", async () => {
  const repo = new FakeComplianceRepository();
  const source = await registerComplianceSource(repo, {
    name: "Source",
    jurisdiction: "Global",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.com/feed.xml",
  });

  await recordFetchOutcome(repo, source.id, { status: "error", error: "HTTP 503" });

  const stored = await repo.getSourceById(source.id);
  assert.equal(stored?.lastFetchStatus, "error");
  assert.equal(stored?.lastFetchError, "HTTP 503");
});

test("activateComplianceSource re-enables a deactivated source", async () => {
  const repo = new FakeComplianceRepository();
  const source = await registerComplianceSource(repo, {
    name: "Source",
    jurisdiction: "Global",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.com/feed.xml",
  });
  await deactivateComplianceSource(repo, source.id);

  await activateComplianceSource(repo, source.id);

  const stored = await repo.getSourceById(source.id);
  assert.equal(stored?.isActive, true);
});

test("activateComplianceSource throws for an unknown source", async () => {
  const repo = new FakeComplianceRepository();
  await assert.rejects(
    () => activateComplianceSource(repo, "ghost-source"),
    (err: unknown) => err instanceof ComplianceSourceError && err.code === "source_not_found",
  );
});

test("updateSourceSchedule records staff intent without touching other fields", async () => {
  const repo = new FakeComplianceRepository();
  const source = await registerComplianceSource(repo, {
    name: "Source",
    jurisdiction: "Global",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.com/feed.xml",
  });
  assert.equal(source.scheduleIntervalMinutes, null);

  await updateSourceSchedule(repo, source.id, 60);

  const stored = await repo.getSourceById(source.id);
  assert.equal(stored?.scheduleIntervalMinutes, 60);
  assert.equal(stored?.isActive, true); // untouched
});

test("addManualComplianceUpdate rejects a non-manual source", async () => {
  const repo = new FakeComplianceRepository();
  const source = await registerComplianceSource(repo, {
    name: "RSS Source",
    jurisdiction: "Global",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.com/feed.xml",
  });
  await assert.rejects(
    () =>
      addManualComplianceUpdate(repo, source.id, {
        externalId: "iso-42001",
        title: "ISO 42001",
        summary: "s",
        url: "https://iso.org/42001",
        publishedAt: null,
        country: null,
        state: null,
      }),
    (err: unknown) => err instanceof ComplianceSourceError && err.code === "not_manual_source",
  );
});

test("the worked example: a manual source accepts a hand-entered document via the exact same ingestion path", async () => {
  const repo = new FakeComplianceRepository();
  const source = await registerComplianceSource(repo, {
    name: "ISO",
    jurisdiction: "Global",
    frameworkTags: ["ISO_42001"],
    sourceType: "manual",
    url: "https://iso.org",
  });

  const summary = await addManualComplianceUpdate(repo, source.id, {
    externalId: "iso-42001",
    title: "ISO/IEC 42001 AI Management System",
    summary: "s",
    url: "https://iso.org/42001",
    publishedAt: null,
    country: null,
    state: null,
  });

  assert.equal(summary.inserted, 1);
  const update = await repo.getUpdateBySourceAndExternalId(source.id, "iso-42001");
  assert.equal(update?.title, "ISO/IEC 42001 AI Management System");
});

test("addManualComplianceUpdate dedupes by externalId, same as automated ingestion", async () => {
  const repo = new FakeComplianceRepository();
  const source = await registerComplianceSource(repo, {
    name: "ISO",
    jurisdiction: "Global",
    frameworkTags: [],
    sourceType: "manual",
    url: "https://iso.org",
  });
  const item = {
    externalId: "iso-42001",
    title: "ISO/IEC 42001",
    summary: "s",
    url: "https://iso.org/42001",
    publishedAt: null,
    country: null,
    state: null,
  };

  await addManualComplianceUpdate(repo, source.id, item);
  const second = await addManualComplianceUpdate(repo, source.id, item);

  assert.equal(second.inserted, 0);
  assert.equal(second.duplicate, 1);
});

test("runComplianceIngestion skips manual sources entirely, even when active", async () => {
  const repo = new FakeComplianceRepository();
  await registerComplianceSource(repo, {
    name: "ISO",
    jurisdiction: "Global",
    frameworkTags: [],
    sourceType: "manual",
    url: "https://iso.org",
  });

  const results = await runComplianceIngestion(repo);
  assert.equal(results.length, 0); // no results at all -- proves it never attempted to fetch a manual source
});
