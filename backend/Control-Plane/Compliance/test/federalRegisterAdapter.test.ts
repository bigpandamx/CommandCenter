import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFederalRegisterResponse } from "../src/federalRegisterAdapter.js";

test("mapFederalRegisterResponse maps documents to normalized items", () => {
  const items = mapFederalRegisterResponse({
    count: 2,
    results: [
      {
        document_number: "2026-15432",
        title: "Artificial Intelligence Risk Management Requirements",
        abstract: "This rule establishes risk management requirements for AI systems used in critical infrastructure.",
        html_url: "https://www.federalregister.gov/documents/2026/07/20/2026-15432",
        publication_date: "2026-07-20",
        effective_on: "2026-10-01",
        type: "RULE",
      },
      {
        document_number: "2026-15200",
        title: "Proposed Guidance on Algorithmic Transparency",
        abstract: null,
        html_url: "https://www.federalregister.gov/documents/2026/07/18/2026-15200",
        publication_date: "2026-07-18",
        type: "PRORULE",
      },
    ],
  });

  assert.equal(items.length, 2);
  assert.equal(items[0]?.externalId, "2026-15432");
  assert.equal(items[0]?.title, "Artificial Intelligence Risk Management Requirements");
  assert.equal(items[0]?.documentType, "new_law");
  assert.equal(items[0]?.publishedAt?.toISOString(), "2026-07-20T00:00:00.000Z");
  assert.equal(items[0]?.effectiveDate?.toISOString(), "2026-10-01T00:00:00.000Z");

  assert.equal(items[1]?.summary, null);
  assert.equal(items[1]?.documentType, "proposed_rule");
  assert.equal(items[1]?.effectiveDate, null, "no effective_on in the source document -- must not be fabricated");
});

test("mapFederalRegisterResponse always sets country to US, unconditionally -- a structural fact about the source, not inferred per-document", () => {
  const items = mapFederalRegisterResponse({
    count: 1,
    results: [
      {
        document_number: "2026-00042",
        title: "Anything",
        abstract: "n/a",
        html_url: "https://www.federalregister.gov/documents/2026/01/01/2026-00042",
        publication_date: "2026-01-01",
      },
    ],
  });
  assert.equal(items[0]?.country, "US");
  assert.equal(items[0]?.state, null, "federal documents are nationwide, not state-specific");
});

test("mapFederalRegisterResponse never fabricates content or industries -- honestly left null/empty since this adapter has no basis for either", () => {
  const items = mapFederalRegisterResponse({
    count: 1,
    results: [
      {
        document_number: "2026-00042",
        title: "Anything",
        abstract: "A short abstract.",
        html_url: "https://www.federalregister.gov/documents/2026/01/01/2026-00042",
        publication_date: "2026-01-01",
      },
    ],
  });
  assert.equal(items[0]?.content, null, "full text requires a separate fetch not built here -- must not be filled with the abstract");
  assert.deepEqual(items[0]?.industries, []);
});

test("mapFederalRegisterResponse leaves documentType undefined for an unrecognized type", () => {
  const items = mapFederalRegisterResponse({
    count: 1,
    results: [
      {
        document_number: "2026-99999",
        title: "Something Unusual",
        abstract: "n/a",
        html_url: "https://www.federalregister.gov/documents/2026/01/01/2026-99999",
        publication_date: "2026-01-01",
        type: "SOMETHING_NEW",
      },
    ],
  });
  assert.equal(items[0]?.documentType, undefined);
});

test("mapFederalRegisterResponse returns an empty array for zero results", () => {
  assert.deepEqual(mapFederalRegisterResponse({ count: 0, results: [] }), []);
});

test("mapFederalRegisterResponse handles a document with no type field at all", () => {
  const items = mapFederalRegisterResponse({
    count: 1,
    results: [
      {
        document_number: "2026-00001",
        title: "Untyped Document",
        abstract: "n/a",
        html_url: "https://www.federalregister.gov/documents/2026/01/01/2026-00001",
        publication_date: "2026-01-01",
      },
    ],
  });
  assert.equal(items[0]?.documentType, undefined);
});
