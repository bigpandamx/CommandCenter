import { test } from "node:test";
import assert from "node:assert/strict";
import { registerComplianceSource } from "../src/sourceManagement.js";
import { runComplianceIngestion, runComplianceIngestionForSource } from "../src/scheduler.js";
import { FakeComplianceRepository } from "./fakeRepository.js";

function mockFetch(handler: (url: string) => { ok: boolean; status?: number; body: string }) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    const { ok, status, body } = handler(url);
    return {
      ok,
      status: status ?? (ok ? 200 : 500),
      text: async () => body,
      json: async () => JSON.parse(body),
    } as unknown as Response;
  }) as typeof fetch;
  return {
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

const RSS_BODY = `<rss><channel>
  <item><title>Item One</title><link>https://example.gov/1</link><guid>1</guid></item>
</channel></rss>`;

const FEDERAL_REGISTER_BODY = JSON.stringify({
  count: 1,
  results: [
    {
      document_number: "2026-1",
      title: "A Rule",
      abstract: "abstract",
      html_url: "https://www.federalregister.gov/documents/2026-1",
      publication_date: "2026-07-20",
      type: "RULE",
    },
  ],
});

test("runComplianceIngestionForSource ingests items and records a successful fetch outcome", async () => {
  const repo = new FakeComplianceRepository();
  const source = await registerComplianceSource(repo, {
    name: "RSS Source",
    jurisdiction: "Global",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/feed.xml",
  });
  const mock = mockFetch(() => ({ ok: true, body: RSS_BODY }));

  try {
    const result = await runComplianceIngestionForSource(repo, source);
    assert.equal(result.status, "success");
    assert.deepEqual(result.summary, { inserted: 1, duplicate: 0 });

    const stored = await repo.getSourceById(source.id);
    assert.equal(stored?.lastFetchStatus, "success");
  } finally {
    mock.restore();
  }
});

test("runComplianceIngestionForSource records an error outcome and does not throw when the fetch fails", async () => {
  const repo = new FakeComplianceRepository();
  const source = await registerComplianceSource(repo, {
    name: "Flaky Source",
    jurisdiction: "Global",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/feed.xml",
  });
  const mock = mockFetch(() => ({ ok: false, status: 503, body: "" }));

  try {
    const result = await runComplianceIngestionForSource(repo, source);
    assert.equal(result.status, "error");
    assert.match(result.error ?? "", /503/);

    const stored = await repo.getSourceById(source.id);
    assert.equal(stored?.lastFetchStatus, "error");
  } finally {
    mock.restore();
  }
});

test("runComplianceIngestionForSource routes json_api sources through the Federal Register mapper", async () => {
  const repo = new FakeComplianceRepository();
  const source = await registerComplianceSource(repo, {
    name: "Federal Register",
    jurisdiction: "US-Federal",
    frameworkTags: ["NIST_AI_RMF"],
    sourceType: "json_api",
    url: "https://www.federalregister.gov/api/v1/documents.json",
  });
  const mock = mockFetch(() => ({ ok: true, body: FEDERAL_REGISTER_BODY }));

  try {
    const result = await runComplianceIngestionForSource(repo, source);
    assert.equal(result.status, "success");
    assert.deepEqual(result.summary, { inserted: 1, duplicate: 0 });
  } finally {
    mock.restore();
  }
});

test("runComplianceIngestion runs every active source independently -- one failure doesn't block the others", async () => {
  const repo = new FakeComplianceRepository();
  const goodSource = await registerComplianceSource(repo, {
    name: "Good",
    jurisdiction: "Global",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://good.example.gov/feed.xml",
  });
  const badSource = await registerComplianceSource(repo, {
    name: "Bad",
    jurisdiction: "Global",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://bad.example.gov/feed.xml",
  });

  const mock = mockFetch((url) => {
    if (url.includes("bad.example.gov")) return { ok: false, status: 500, body: "" };
    return { ok: true, body: RSS_BODY };
  });

  try {
    const results = await runComplianceIngestion(repo);
    assert.equal(results.length, 2);

    const goodResult = results.find((r) => r.sourceId === goodSource.id);
    const badResult = results.find((r) => r.sourceId === badSource.id);
    assert.equal(goodResult?.status, "success");
    assert.equal(badResult?.status, "error");
  } finally {
    mock.restore();
  }
});

test("runComplianceIngestion skips inactive sources", async () => {
  const repo = new FakeComplianceRepository();
  const active = await registerComplianceSource(repo, {
    name: "Active",
    jurisdiction: "Global",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/feed.xml",
  });
  const inactiveSrc = await registerComplianceSource(repo, {
    name: "Inactive",
    jurisdiction: "Global",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/other.xml",
  });
  await repo.deactivateSource(inactiveSrc.id);

  const mock = mockFetch(() => ({ ok: true, body: RSS_BODY }));
  try {
    const results = await runComplianceIngestion(repo);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.sourceId, active.id);
  } finally {
    mock.restore();
  }
});
