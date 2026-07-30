import { test } from "node:test";
import assert from "node:assert/strict";
import { mapNvdResponse } from "../src/nvdAdapter.js";

function buildResponse(vulnerabilities: unknown[]) {
  return {
    resultsPerPage: vulnerabilities.length,
    startIndex: 0,
    totalResults: vulnerabilities.length,
    vulnerabilities,
  } as Parameters<typeof mapNvdResponse>[0];
}

test("maps the core required fields -- id, status, English description, published/lastModified", () => {
  const response = buildResponse([
    {
      cve: {
        id: "CVE-2024-12345",
        sourceIdentifier: "[email protected]",
        published: "2024-03-01T10:00:00.000",
        lastModified: "2024-03-05T14:30:00.000",
        vulnStatus: "Analyzed",
        descriptions: [
          { lang: "es", value: "Descripcion en espanol" },
          { lang: "en", value: "A buffer overflow in Example Widget allows remote code execution." },
        ],
        references: [],
      },
    },
  ]);

  const [vuln] = mapNvdResponse(response);
  assert.equal(vuln!.cveId, "CVE-2024-12345");
  assert.equal(vuln!.vulnStatus, "Analyzed");
  assert.equal(vuln!.description, "A buffer overflow in Example Widget allows remote code execution.");
  assert.equal(vuln!.publishedAt.toISOString(), new Date("2024-03-01T10:00:00.000Z").toISOString());
  assert.equal(vuln!.lastModifiedAt.toISOString(), new Date("2024-03-05T14:30:00.000Z").toISOString());
});

test("prefers CVSS v3.1 over v3.0 and v2 when multiple are present", () => {
  const response = buildResponse([
    {
      cve: {
        id: "CVE-2024-11111",
        sourceIdentifier: "x",
        published: "2024-01-01T00:00:00.000",
        lastModified: "2024-01-01T00:00:00.000",
        vulnStatus: "Analyzed",
        descriptions: [{ lang: "en", value: "x" }],
        references: [],
        metrics: {
          cvssMetricV2: [{ source: "nvd", type: "Primary", cvssData: { version: "2.0", vectorString: "AV:N/AC:L/Au:N/C:C/I:C/A:C", baseScore: 10.0 } }],
          cvssMetricV31: [{ source: "nvd", type: "Primary", cvssData: { version: "3.1", vectorString: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", baseScore: 9.8 }, baseSeverity: "CRITICAL" }],
        },
      },
    },
  ]);

  const [vuln] = mapNvdResponse(response);
  assert.equal(vuln!.cvssVersion, "3.1");
  assert.equal(vuln!.cvssBaseScore, 9.8);
  assert.equal(vuln!.cvssBaseSeverity, "critical");
});

test("falls back to CVSS v2 and derives severity from score when no v3 metric exists", () => {
  const response = buildResponse([
    {
      cve: {
        id: "CVE-2010-00001",
        sourceIdentifier: "x",
        published: "2010-01-01T00:00:00.000",
        lastModified: "2010-01-01T00:00:00.000",
        vulnStatus: "Analyzed",
        descriptions: [{ lang: "en", value: "x" }],
        references: [],
        metrics: {
          cvssMetricV2: [{ source: "nvd", type: "Primary", cvssData: { version: "2.0", vectorString: "AV:N/AC:L/Au:N/C:C/I:C/A:C", baseScore: 8.5 } }],
        },
      },
    },
  ]);

  const [vuln] = mapNvdResponse(response);
  assert.equal(vuln!.cvssVersion, "2.0");
  assert.equal(vuln!.cvssBaseScore, 8.5);
  assert.equal(vuln!.cvssBaseSeverity, "high"); // derived: 7-10 -> high in V2's own banding
});

test("a CVE with no metrics object at all (e.g. still Awaiting Analysis) maps to all-null CVSS fields, not a crash", () => {
  const response = buildResponse([
    {
      cve: {
        id: "CVE-2024-99999",
        sourceIdentifier: "x",
        published: "2024-06-01T00:00:00.000",
        lastModified: "2024-06-01T00:00:00.000",
        vulnStatus: "Awaiting Analysis",
        descriptions: [{ lang: "en", value: "x" }],
        references: [],
      },
    },
  ]);

  const [vuln] = mapNvdResponse(response);
  assert.equal(vuln!.cvssVersion, null);
  assert.equal(vuln!.cvssBaseScore, null);
  assert.equal(vuln!.cvssBaseSeverity, null);
});

test("KEV status is derived from cisaExploitAdd's presence, with the full CISA context carried through", () => {
  const response = buildResponse([
    {
      cve: {
        id: "CVE-2023-55555",
        sourceIdentifier: "x",
        published: "2023-01-01T00:00:00.000",
        lastModified: "2023-01-01T00:00:00.000",
        vulnStatus: "Analyzed",
        descriptions: [{ lang: "en", value: "x" }],
        references: [],
        cisaExploitAdd: "2023-02-15",
        cisaActionDue: "2023-03-08",
        cisaRequiredAction: "Apply updates per vendor instructions.",
        cisaVulnerabilityName: "Example Widget RCE",
      },
    },
    {
      cve: {
        id: "CVE-2023-66666",
        sourceIdentifier: "x",
        published: "2023-01-01T00:00:00.000",
        lastModified: "2023-01-01T00:00:00.000",
        vulnStatus: "Analyzed",
        descriptions: [{ lang: "en", value: "x" }],
        references: [],
      },
    },
  ]);

  const [kevListed, notKevListed] = mapNvdResponse(response);
  assert.equal(kevListed!.isKnownExploited, true);
  assert.equal(kevListed!.kevRequiredAction, "Apply updates per vendor instructions.");
  assert.equal(kevListed!.kevVulnerabilityName, "Example Widget RCE");
  assert.equal(notKevListed!.isKnownExploited, false);
  assert.equal(notKevListed!.kevAddedAt, null);
});

test("weaknesses are flattened to a plain CWE-id string list, English only", () => {
  const response = buildResponse([
    {
      cve: {
        id: "CVE-2024-22222",
        sourceIdentifier: "x",
        published: "2024-01-01T00:00:00.000",
        lastModified: "2024-01-01T00:00:00.000",
        vulnStatus: "Analyzed",
        descriptions: [{ lang: "en", value: "x" }],
        references: [],
        weaknesses: [
          { source: "nvd", type: "Primary", description: [{ lang: "en", value: "CWE-79" }] },
          { source: "nvd", type: "Secondary", description: [{ lang: "en", value: "CWE-89" }] },
        ],
      },
    },
  ]);

  const [vuln] = mapNvdResponse(response);
  assert.deepEqual(vuln!.weaknesses, ["CWE-79", "CWE-89"]);
});

test("affected products are flattened from the nested configurations/nodes/cpeMatch tree to a deduplicated flat list, vulnerable entries only", () => {
  const response = buildResponse([
    {
      cve: {
        id: "CVE-2024-33333",
        sourceIdentifier: "x",
        published: "2024-01-01T00:00:00.000",
        lastModified: "2024-01-01T00:00:00.000",
        vulnStatus: "Analyzed",
        descriptions: [{ lang: "en", value: "x" }],
        references: [],
        configurations: [
          {
            nodes: [
              {
                operator: "OR",
                cpeMatch: [
                  { vulnerable: true, criteria: "cpe:2.3:a:example:widget:1.0:*:*:*:*:*:*:*", matchCriteriaId: "a" },
                  { vulnerable: false, criteria: "cpe:2.3:a:example:widget:2.0:*:*:*:*:*:*:*", matchCriteriaId: "b" },
                ],
              },
            ],
          },
        ],
      },
    },
  ]);

  const [vuln] = mapNvdResponse(response);
  assert.deepEqual(vuln!.affectedProducts, ["cpe:2.3:a:example:widget:1.0:*:*:*:*:*:*:*"]);
});

test("references are mapped to a plain URL list", () => {
  const response = buildResponse([
    {
      cve: {
        id: "CVE-2024-44444",
        sourceIdentifier: "x",
        published: "2024-01-01T00:00:00.000",
        lastModified: "2024-01-01T00:00:00.000",
        vulnStatus: "Analyzed",
        descriptions: [{ lang: "en", value: "x" }],
        references: [{ url: "https://example.com/advisory", source: "vendor" }, { url: "https://example.com/patch" }],
      },
    },
  ]);

  const [vuln] = mapNvdResponse(response);
  assert.deepEqual(vuln!.referenceUrls, ["https://example.com/advisory", "https://example.com/patch"]);
});

test("maps a full page of multiple CVEs, not just a single-item response", () => {
  const response = buildResponse([
    { cve: { id: "CVE-2024-00001", sourceIdentifier: "x", published: "2024-01-01T00:00:00.000", lastModified: "2024-01-01T00:00:00.000", vulnStatus: "Analyzed", descriptions: [{ lang: "en", value: "First" }], references: [] } },
    { cve: { id: "CVE-2024-00002", sourceIdentifier: "x", published: "2024-01-02T00:00:00.000", lastModified: "2024-01-02T00:00:00.000", vulnStatus: "Analyzed", descriptions: [{ lang: "en", value: "Second" }], references: [] } },
  ]);

  const vulns = mapNvdResponse(response);
  assert.equal(vulns.length, 2);
  assert.deepEqual(vulns.map((v) => v.cveId), ["CVE-2024-00001", "CVE-2024-00002"]);
});
