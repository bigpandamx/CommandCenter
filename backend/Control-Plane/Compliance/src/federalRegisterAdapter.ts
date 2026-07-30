import type { ComplianceSource, NormalizedComplianceItem } from "./types.js";

/**
 * Adapter for the Federal Register API (federalregister.gov) -- the
 * official daily journal of the US federal government, covering final
 * rules, proposed rules, and notices. Free, no API key, long-standing
 * public service. This is the one source in this module chosen because
 * it's a well-known, stable government API, not because its exact
 * request/response shape was verified live -- it wasn't (no network in
 * the build sandbox, no web_search tool available either). Verify the
 * field names below (document_number, abstract, html_url,
 * publication_date, effective_on, type) against
 * https://www.federalregister.gov/developers/documentation/api/v1
 * before enabling this in production; treat this file as a well-informed
 * first draft, not a confirmed integration.
 *
 * country is unconditionally "US" -- not a guess, a structural fact
 * about what Federal Register publishes, unlike the fields this adapter
 * genuinely can't determine: industries (Federal Register's own
 * "agencies" field is an adjacent but different axis -- "Department of
 * Labor" isn't an industry -- left empty rather than mapped loosely),
 * and content (the API exposes full text only via a separate
 * body_html_url/raw_text_url fetch, not inline; a second network round
 * trip per document is a real scope increase left for later, not
 * silently added here -- left null, not filled with the abstract, which
 * is already captured faithfully in `summary`).
 *
 * mapFederalRegisterResponse() is the tested part (see
 * test/federalRegisterAdapter.test.ts, exercised against a hand-written
 * sample response matching the documented shape). fetchFederalRegisterUpdates()
 * is the untested network edge.
 */

interface FederalRegisterDocument {
  document_number: string;
  title: string;
  abstract: string | null;
  html_url: string;
  publication_date: string; // YYYY-MM-DD
  effective_on?: string | null; // YYYY-MM-DD, absent for documents with no effective date
  type?: string;
}

interface FederalRegisterResponse {
  count: number;
  results: FederalRegisterDocument[];
}

const DOCUMENT_TYPE_BY_TYPE: Record<string, NormalizedComplianceItem["documentType"]> = {
  RULE: "new_law",
  PRORULE: "proposed_rule",
  NOTICE: "guidance",
};

export function mapFederalRegisterResponse(response: FederalRegisterResponse): NormalizedComplianceItem[] {
  return response.results.map((doc) => ({
    externalId: doc.document_number,
    title: doc.title,
    summary: doc.abstract,
    content: null,
    url: doc.html_url,
    publishedAt: parseDateOnly(doc.publication_date),
    effectiveDate: doc.effective_on ? parseDateOnly(doc.effective_on) : null,
    country: "US",
    state: null,
    industries: [],
    documentType: doc.type ? DOCUMENT_TYPE_BY_TYPE[doc.type] : undefined,
  }));
}

function parseDateOnly(raw: string): Date | null {
  const parsed = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Untested against live network. `source.url` is expected to be a full
 * documents.json query URL (e.g. filtered by agency or search term via
 * the source's own configured query params) -- this adapter doesn't
 * construct the query itself, it just fetches and maps whatever URL the
 * source record points at.
 */
export async function fetchFederalRegisterUpdates(source: ComplianceSource): Promise<NormalizedComplianceItem[]> {
  const response = await fetch(source.url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Fetch failed for ${source.url}: HTTP ${response.status}`);
  }
  const body = (await response.json()) as FederalRegisterResponse;
  return mapFederalRegisterResponse(body);
}
