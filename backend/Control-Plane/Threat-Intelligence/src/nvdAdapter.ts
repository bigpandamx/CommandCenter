import type { CvssSeverity, Vulnerability } from "./types.js";

/**
 * Adapter for NVD's CVE API 2.0 (services.nvd.nist.gov/rest/json/cves/2.0).
 * Free, no API key required (an optional key raises the rate limit from
 * 5 to 50 requests/30s). Verified directly against NVD's own published
 * developer documentation (nvd.nist.gov/developers/vulnerabilities)
 * before writing this file, not assumed by analogy the way an earlier
 * adapter in this codebase (Federal Register) had to be built without
 * live network access -- this one's field names and response shape are
 * a confirmed integration, not a first draft to verify later.
 *
 * mapNvdResponse() is the tested pure part (see
 * test/nvdAdapter.test.ts, exercised against hand-written sample
 * responses matching NVD's own documented shape).
 * fetchNvdVulnerabilities() is the untested network edge, handling
 * NVD's offset-based pagination (startIndex/resultsPerPage/totalResults).
 *
 * CVSS version preference: V3.1 > V3.0 > V2, matching Vulnerability's
 * own doc comment -- NVD stopped actively populating V2 in mid-2022,
 * and a CVE can carry multiple metric sources (NVD itself, or a CNA);
 * within whichever version is chosen, the "Primary" source entry is
 * preferred over a "Secondary" one when both exist.
 *
 * affectedProducts is deliberately flattened from NVD's own nested
 * configurations/AND-OR/NEGATE logic tree to a plain list of CPE match
 * criteria strings -- the full boolean structure (which products must
 * ALL be present vs. EITHER being enough) isn't modeled here. That
 * tree matters for precise vulnerability-scanning tools; for "which
 * products does this touch," the flat list is what a dashboard or
 * search actually needs.
 */

interface NvdDescription {
  lang: string;
  value: string;
}

interface NvdCvssData {
  version: string;
  vectorString: string;
  baseScore: number;
}

interface NvdCvssMetric {
  source: string;
  type: "Primary" | "Secondary";
  cvssData: NvdCvssData;
  baseSeverity?: string; // present on V2 entries at the metric level, not inside cvssData
}

interface NvdWeaknessDescription {
  lang: string;
  value: string;
}

interface NvdWeakness {
  source: string;
  type: string;
  description: NvdWeaknessDescription[];
}

interface NvdCpeMatch {
  vulnerable: boolean;
  criteria: string;
  matchCriteriaId: string;
}

interface NvdConfigNode {
  operator: string;
  negate?: boolean;
  cpeMatch: NvdCpeMatch[];
}

interface NvdConfiguration {
  nodes: NvdConfigNode[];
}

interface NvdReference {
  url: string;
  source?: string;
}

interface NvdCve {
  id: string;
  sourceIdentifier: string;
  published: string;
  lastModified: string;
  vulnStatus: string;
  descriptions: NvdDescription[];
  metrics?: {
    cvssMetricV31?: NvdCvssMetric[];
    cvssMetricV30?: NvdCvssMetric[];
    cvssMetricV2?: NvdCvssMetric[];
  };
  weaknesses?: NvdWeakness[];
  configurations?: NvdConfiguration[];
  references: NvdReference[];
  cisaExploitAdd?: string;
  cisaActionDue?: string;
  cisaRequiredAction?: string;
  cisaVulnerabilityName?: string;
}

interface NvdVulnerabilityEntry {
  cve: NvdCve;
}

interface NvdCveResponse {
  resultsPerPage: number;
  startIndex: number;
  totalResults: number;
  vulnerabilities: NvdVulnerabilityEntry[];
}

function pickEnglishDescription(descriptions: NvdDescription[]): string {
  return descriptions.find((d) => d.lang === "en")?.value ?? descriptions[0]?.value ?? "";
}

function pickPrimaryMetric(metrics: NvdCvssMetric[] | undefined): NvdCvssMetric | null {
  if (!metrics || metrics.length === 0) return null;
  return metrics.find((m) => m.type === "Primary") ?? metrics[0]!;
}

function normalizeSeverity(raw: string | undefined): CvssSeverity | null {
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  if (lowered === "critical" || lowered === "high" || lowered === "medium" || lowered === "low" || lowered === "none") {
    return lowered;
  }
  return null;
}

/** V2 has no baseSeverity in cvssData itself -- NVD derives it from the score at the metric level (0-3.9 LOW, 4-6.9 MEDIUM, 7-10 HIGH, no CRITICAL band in V2). */
function deriveV2Severity(score: number): CvssSeverity {
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}

function extractCvss(cve: NvdCve): { version: string | null; score: number | null; severity: CvssSeverity | null; vector: string | null } {
  const v31 = pickPrimaryMetric(cve.metrics?.cvssMetricV31);
  if (v31) {
    return { version: v31.cvssData.version, score: v31.cvssData.baseScore, severity: normalizeSeverity(v31.baseSeverity), vector: v31.cvssData.vectorString };
  }
  const v30 = pickPrimaryMetric(cve.metrics?.cvssMetricV30);
  if (v30) {
    return { version: v30.cvssData.version, score: v30.cvssData.baseScore, severity: normalizeSeverity(v30.baseSeverity), vector: v30.cvssData.vectorString };
  }
  const v2 = pickPrimaryMetric(cve.metrics?.cvssMetricV2);
  if (v2) {
    return { version: v2.cvssData.version, score: v2.cvssData.baseScore, severity: deriveV2Severity(v2.cvssData.baseScore), vector: v2.cvssData.vectorString };
  }
  return { version: null, score: null, severity: null, vector: null };
}

function extractWeaknesses(weaknesses: NvdWeakness[] | undefined): string[] | null {
  if (!weaknesses || weaknesses.length === 0) return null;
  const ids = weaknesses.flatMap((w) => w.description.filter((d) => d.lang === "en").map((d) => d.value));
  return ids.length > 0 ? ids : null;
}

function extractAffectedProducts(configurations: NvdConfiguration[] | undefined): string[] | null {
  if (!configurations || configurations.length === 0) return null;
  const criteria = configurations.flatMap((c) => c.nodes.flatMap((n) => n.cpeMatch.filter((m) => m.vulnerable).map((m) => m.criteria)));
  return criteria.length > 0 ? [...new Set(criteria)] : null;
}

export function mapNvdResponse(response: NvdCveResponse, now: Date = new Date()): Vulnerability[] {
  return response.vulnerabilities.map(({ cve }) => {
    const cvss = extractCvss(cve);
    return {
      id: "", // assigned by ingestVulnerabilities on first insert; the upsert key is cveId, not id
      cveId: cve.id,
      vulnStatus: cve.vulnStatus,
      description: pickEnglishDescription(cve.descriptions),
      cvssVersion: cvss.version,
      cvssBaseScore: cvss.score,
      cvssBaseSeverity: cvss.severity,
      cvssVectorString: cvss.vector,
      weaknesses: extractWeaknesses(cve.weaknesses),
      affectedProducts: extractAffectedProducts(cve.configurations),
      referenceUrls: cve.references.length > 0 ? cve.references.map((r) => r.url) : null,
      isKnownExploited: cve.cisaExploitAdd !== undefined,
      kevAddedAt: cve.cisaExploitAdd ? new Date(cve.cisaExploitAdd) : null,
      kevDueDate: cve.cisaActionDue ? new Date(cve.cisaActionDue) : null,
      kevRequiredAction: cve.cisaRequiredAction ?? null,
      kevVulnerabilityName: cve.cisaVulnerabilityName ?? null,
      publishedAt: new Date(cve.published),
      lastModifiedAt: new Date(cve.lastModified),
      ingestedAt: now,
      updatedAt: now,
    };
  });
}

const NVD_BASE_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const RESULTS_PER_PAGE = 2000; // NVD's own documented maximum

/**
 * Untested against live network. Pages through NVD's offset-based
 * results (startIndex/resultsPerPage/totalResults) until every result
 * in the window has been fetched. lastModStartDate/lastModEndDate is
 * NVD's own recommended incremental-sync mechanism -- see this
 * file's own top comment and Vulnerability's doc comment for why the
 * window is derived from already-stored data, not tracked separately.
 */
export async function fetchNvdVulnerabilities(since: Date, until: Date, apiKey?: string): Promise<Vulnerability[]> {
  const results: Vulnerability[] = [];
  let startIndex = 0;
  let totalResults = Infinity;

  while (startIndex < totalResults) {
    const params = new URLSearchParams({
      lastModStartDate: since.toISOString(),
      lastModEndDate: until.toISOString(),
      resultsPerPage: String(RESULTS_PER_PAGE),
      startIndex: String(startIndex),
    });
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey) headers.apiKey = apiKey;

    const response = await fetch(`${NVD_BASE_URL}?${params.toString()}`, { headers });
    if (!response.ok) {
      throw new Error(`NVD fetch failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as NvdCveResponse;
    results.push(...mapNvdResponse(body));

    totalResults = body.totalResults;
    startIndex += body.resultsPerPage || RESULTS_PER_PAGE;
  }

  return results;
}
