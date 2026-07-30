import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  computeControlLibraryStats,
  computeControlLibraryStatsForControl,
  ControlLibraryStatsError,
} from "../src/controlLibraryStats.js";
import { FakeComplianceRepository } from "../../Compliance/test/fakeRepository.js";
import { FakeOrganizationsRepository } from "../../Organizations/test/fakeRepository.js";
import { FakeServiceCatalogRepository } from "../../../Platform-Services/ServiceCatalog/test/fakeServiceCatalogRepository.js";
import { FakeBillingRepository } from "../../../Platform-Services/Subscriptions/test/fakeBillingRepository.js";
import { registerComplianceSource } from "../../Compliance/src/sourceManagement.js";
import { ingestComplianceItems } from "../../Compliance/src/ingestion.js";
import { analyzeComplianceUpdate } from "../../Compliance/src/analysisService.js";
import { createControl, mapObligationToControl } from "../../Compliance/src/controlService.js";
import { FakeAIProvider } from "../../../Customer-Connections/AIChat/test/fakeAIProvider.js";
import type { Organization } from "../../../Customer-Connections/Desktop-Apps/src/types.js";
import type { OrganizationProfile } from "../../Organizations/src/profileTypes.js";

function buildOrg(overrides: Partial<Organization> = {}): Organization {
  return { id: randomUUID(), name: "Test Org", entitlementTier: "standard", createdAt: new Date(), ...overrides };
}

function buildProfile(organizationId: string, overrides: Partial<OrganizationProfile> = {}): OrganizationProfile {
  return {
    organizationId,
    slug: `org-${organizationId.slice(0, 8)}`,
    primaryContactName: "Jane Doe",
    primaryContactEmail: "jane@example.com",
    primaryContactPhone: null,
    industry: null,
    companySize: null,
    website: null,
    country: null,
    notes: null,
    cloudProviders: [],
    aiProviders: [],
    deviceTypes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function seedOrg(orgsRepo: FakeOrganizationsRepository, overrides: Partial<OrganizationProfile> = {}) {
  const org = buildOrg();
  await orgsRepo.createOrganization(org);
  await orgsRepo.createProfile(buildProfile(org.id, overrides));
  return org;
}

let sourceCounter = 0;

async function seedObligation(
  complianceRepo: FakeComplianceRepository,
  aiProvider: FakeAIProvider,
  documentCountry: string | null,
  obligationIndustries: string[],
) {
  sourceCounter += 1;
  const source = await registerComplianceSource(complianceRepo, {
    name: `Test Source ${sourceCounter}`,
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: `https://example.gov/feed-${sourceCounter}.xml`,
  });
  await ingestComplianceItems(complianceRepo, source, [
    { externalId: "a", title: "AI Rule", summary: "s", url: `https://example.gov/${sourceCounter}`, publishedAt: null, country: documentCountry, state: null },
  ]);
  const update = (await complianceRepo.getUpdateBySourceAndExternalId(source.id, "a"))!;

  aiProvider.nextResponse = {
    content: JSON.stringify({
      isAiRelated: true,
      enforceability: "enforceable",
      country: documentCountry,
      state: null,
      industries: obligationIndustries,
      topics: [],
      summary: "Summary.",
      riskLevel: "high",
      actionItems: [],
      keywords: [],
      obligations: [
        {
          description: "Conduct an annual AI risk assessment",
          obligationType: "assessment",
          industries: obligationIndustries,
          deadlineDescription: null,
        },
      ],
    }),
    tokensUsed: 200,
    model: "claude-sonnet-5",
  };
  await analyzeComplianceUpdate(complianceRepo, aiProvider, update.id);
  const obligations = await complianceRepo.listObligationsForUpdate(update.id);
  return obligations[0]!;
}

test("computeControlLibraryStatsForControl: a control with no mapped obligations reports zero for both stats", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const control = await createControl(complianceRepo, {
    key: "ai-transparency",
    code: "CTRL-AI-001",
    name: "AI Transparency",
    description: "Disclose AI use to affected individuals.",
  });

  const stats = await computeControlLibraryStatsForControl(complianceRepo, orgsRepo, catalogRepo, billingRepo, control.key);

  assert.equal(stats.mappedObligationCount, 0);
  assert.equal(stats.organizationsImpactedCount, 0);
  assert.equal(stats.controlCode, "CTRL-AI-001");
});

test("computeControlLibraryStatsForControl: mappedObligationCount reflects real mappings, not a guess", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const aiProvider = new FakeAIProvider();
  const control = await createControl(complianceRepo, {
    key: "ai-transparency",
    code: "CTRL-AI-001",
    name: "AI Transparency",
    description: "Disclose AI use to affected individuals.",
  });

  const obligationA = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"]);
  const obligationB = await seedObligation(complianceRepo, aiProvider, "US", ["finance"]);
  await mapObligationToControl(complianceRepo, obligationA.id, control.key);
  await mapObligationToControl(complianceRepo, obligationB.id, control.key);

  const stats = await computeControlLibraryStatsForControl(complianceRepo, orgsRepo, catalogRepo, billingRepo, control.key);

  assert.equal(stats.mappedObligationCount, 2);
});

test("computeControlLibraryStatsForControl: organizationsImpactedCount unions across mapped obligations, not sums -- the same org affected by two mapped obligations counts once", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const aiProvider = new FakeAIProvider();
  const control = await createControl(complianceRepo, {
    key: "ai-transparency",
    code: "CTRL-AI-001",
    name: "AI Transparency",
    description: "Disclose AI use to affected individuals.",
  });

  // Both obligations are DE/healthcare -- the same org will be affected by both.
  const sharedOrg = await seedOrg(orgsRepo, { country: "DE", industry: "healthcare" });
  const obligationA = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"]);
  const obligationB = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"]);
  await mapObligationToControl(complianceRepo, obligationA.id, control.key);
  await mapObligationToControl(complianceRepo, obligationB.id, control.key);

  const stats = await computeControlLibraryStatsForControl(complianceRepo, orgsRepo, catalogRepo, billingRepo, control.key);

  assert.equal(stats.organizationsImpactedCount, 1, "the same org affected by both mapped obligations should count once, not twice");
  assert.ok(sharedOrg.id, "sanity: the org was actually created");
});

test("computeControlLibraryStatsForControl: distinct orgs across distinct mapped obligations both count", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const aiProvider = new FakeAIProvider();
  const control = await createControl(complianceRepo, {
    key: "ai-transparency",
    code: "CTRL-AI-001",
    name: "AI Transparency",
    description: "Disclose AI use to affected individuals.",
  });

  await seedOrg(orgsRepo, { country: "DE", industry: "healthcare" });
  await seedOrg(orgsRepo, { country: "US", industry: "finance" });
  const obligationA = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"]);
  const obligationB = await seedObligation(complianceRepo, aiProvider, "US", ["finance"]);
  await mapObligationToControl(complianceRepo, obligationA.id, control.key);
  await mapObligationToControl(complianceRepo, obligationB.id, control.key);

  const stats = await computeControlLibraryStatsForControl(complianceRepo, orgsRepo, catalogRepo, billingRepo, control.key);

  assert.equal(stats.organizationsImpactedCount, 2);
});

test("computeControlLibraryStatsForControl: an obligation mapped to the control but excluding every org contributes 0 to organizationsImpactedCount", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const aiProvider = new FakeAIProvider();
  const control = await createControl(complianceRepo, {
    key: "ai-transparency",
    code: "CTRL-AI-001",
    name: "AI Transparency",
    description: "Disclose AI use to affected individuals.",
  });

  await seedOrg(orgsRepo, { country: "US", industry: "finance" }); // won't match a DE/healthcare obligation
  const obligation = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"]);
  await mapObligationToControl(complianceRepo, obligation.id, control.key);

  const stats = await computeControlLibraryStatsForControl(complianceRepo, orgsRepo, catalogRepo, billingRepo, control.key);

  assert.equal(stats.mappedObligationCount, 1, "the obligation is still mapped, even though it affects nobody");
  assert.equal(stats.organizationsImpactedCount, 0);
});

test("computeControlLibraryStatsForControl throws control_not_found for an unknown control key", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();

  await assert.rejects(
    () => computeControlLibraryStatsForControl(complianceRepo, orgsRepo, catalogRepo, billingRepo, "ghost-control"),
    (err: unknown) => err instanceof ControlLibraryStatsError && err.code === "control_not_found",
  );
});

test("computeControlLibraryStats returns one entry per control in the library", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  await createControl(complianceRepo, { key: "ai-transparency", code: "CTRL-AI-001", name: "AI Transparency", description: "d" });
  await createControl(complianceRepo, { key: "data-retention", code: "CTRL-DATA-001", name: "Data Retention", description: "d" });

  const stats = await computeControlLibraryStats(complianceRepo, orgsRepo, catalogRepo, billingRepo);

  assert.equal(stats.length, 2);
  assert.deepEqual(
    stats.map((s) => s.controlKey).sort(),
    ["ai-transparency", "data-retention"],
  );
});

test("computeControlLibraryStats returns an empty array for a genuinely empty library", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();

  const stats = await computeControlLibraryStats(complianceRepo, orgsRepo, catalogRepo, billingRepo);

  assert.deepEqual(stats, []);
});
