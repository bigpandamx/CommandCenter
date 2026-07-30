import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { distributeObligationImpact } from "../src/distribution.js";
import { ImpactAssessmentError } from "../src/types.js";
import { FakeComplianceRepository } from "../../Compliance/test/fakeRepository.js";
import { FakeOrganizationsRepository } from "../../Organizations/test/fakeRepository.js";
import { FakeServiceCatalogRepository } from "../../../Platform-Services/ServiceCatalog/test/fakeServiceCatalogRepository.js";
import { FakeBillingRepository } from "../../../Platform-Services/Subscriptions/test/fakeBillingRepository.js";
import { registerComplianceSource } from "../../Compliance/src/sourceManagement.js";
import { ingestComplianceItems } from "../../Compliance/src/ingestion.js";
import { analyzeComplianceUpdate } from "../../Compliance/src/analysisService.js";
import { FakeAIProvider } from "../../../Customer-Connections/AIChat/test/fakeAIProvider.js";
import { FakeAnnouncementsRepository } from "../../Announcements/test/fakeRepository.js";
import { publishAnnouncement, listActiveAnnouncementsFor } from "../../Announcements/src/announcementService.js";
import type { Organization } from "../../../Customer-Connections/Desktop-Apps/src/types.js";
import type { OrganizationProfile } from "../../Organizations/src/profileTypes.js";

const STAFF_ID = randomUUID();

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

async function seedObligation(
  complianceRepo: FakeComplianceRepository,
  aiProvider: FakeAIProvider,
  documentCountry: string | null,
  obligationIndustries: string[],
  riskLevel = "high",
  documentTitle = "AI Rule",
) {
  const source = await registerComplianceSource(complianceRepo, {
    name: "Test Source",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/feed.xml",
  });
  await ingestComplianceItems(complianceRepo, source, [
    { externalId: "a", title: documentTitle, summary: "s", url: "https://example.gov/a", publishedAt: null, country: documentCountry, state: null },
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
      riskLevel,
      actionItems: ["Review AI governance policy"],
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

test("distributeObligationImpact creates one draft announcement per affected org, none for excluded ones", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  const aiProvider = new FakeAIProvider();

  const affectedOrg = await seedOrg(orgsRepo, { country: "DE", industry: "healthcare" });
  const excludedOrg = await seedOrg(orgsRepo, { country: "US", industry: "healthcare" });
  const obligation = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"]);

  const created = await distributeObligationImpact(complianceRepo, orgsRepo, catalogRepo, billingRepo, announcementsRepo, obligation.id, STAFF_ID);

  assert.equal(created.length, 1);
  assert.equal(created[0]!.organizationId, affectedOrg.id);
  assert.notEqual(created[0]!.organizationId, excludedOrg.id);
  assert.equal(created[0]!.status, "draft");
});

test("distributeObligationImpact's title includes the source document's title, not the obligation's own legal description", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  const aiProvider = new FakeAIProvider();

  await seedOrg(orgsRepo, { country: "DE", industry: "healthcare" });
  const obligation = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"], "high", "New AI Governance Rule");

  const created = await distributeObligationImpact(complianceRepo, orgsRepo, catalogRepo, billingRepo, announcementsRepo, obligation.id, STAFF_ID);

  assert.ok(created[0]!.title.includes("New AI Governance Rule"));
});

test("distributeObligationImpact's body includes reasons and action items", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  const aiProvider = new FakeAIProvider();

  await seedOrg(orgsRepo, { country: "DE", industry: "healthcare" });
  const obligation = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"]);

  const created = await distributeObligationImpact(complianceRepo, orgsRepo, catalogRepo, billingRepo, announcementsRepo, obligation.id, STAFF_ID);

  assert.ok(created[0]!.body.includes("DE"));
  assert.ok(created[0]!.body.includes("Review AI governance policy"));
});

test("severity mapping: critical/high/medium/low map correctly", async () => {
  const cases: Array<[string, "info" | "warning" | "critical"]> = [
    ["critical", "critical"],
    ["high", "warning"],
    ["medium", "warning"],
    ["low", "info"],
  ];

  for (const [riskLevel, expectedSeverity] of cases) {
    const complianceRepo = new FakeComplianceRepository();
    const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
    const announcementsRepo = new FakeAnnouncementsRepository();
    const aiProvider = new FakeAIProvider();

    await seedOrg(orgsRepo, { country: "DE", industry: "healthcare" });
    const obligation = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"], riskLevel);

    const created = await distributeObligationImpact(complianceRepo, orgsRepo, catalogRepo, billingRepo, announcementsRepo, obligation.id, STAFF_ID);
    assert.equal(created[0]!.severity, expectedSeverity, `riskLevel "${riskLevel}" should map to severity "${expectedSeverity}"`);
  }
});

test("distributeObligationImpact throws obligation_not_found for an unknown obligation id", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();

  await assert.rejects(
    () => distributeObligationImpact(complianceRepo, orgsRepo, catalogRepo, billingRepo, announcementsRepo, "ghost-obligation", STAFF_ID),
    (err: unknown) => err instanceof ImpactAssessmentError && err.code === "obligation_not_found",
  );
});

test("the full loop: distribute, publish, then pull for the affected org shows it, pull for a different org does not", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const announcementsRepo = new FakeAnnouncementsRepository();
  const aiProvider = new FakeAIProvider();

  const affectedOrg = await seedOrg(orgsRepo, { country: "DE", industry: "healthcare" });
  const otherOrg = await seedOrg(orgsRepo, { country: "DE", industry: "healthcare" });
  const obligation = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"]);

  const created = await distributeObligationImpact(complianceRepo, orgsRepo, catalogRepo, billingRepo, announcementsRepo, obligation.id, STAFF_ID);
  await publishAnnouncement(announcementsRepo, created[0]!.id);

  const pullForAffectedOrg = await listActiveAnnouncementsFor(announcementsRepo, "customers", new Date(), undefined, affectedOrg.id);
  const pullForOtherOrg = await listActiveAnnouncementsFor(announcementsRepo, "customers", new Date(), undefined, otherOrg.id);
  const pullWithNoOrg = await listActiveAnnouncementsFor(announcementsRepo, "customers", new Date());

  assert.equal(pullForAffectedOrg.length, 1);
  assert.equal(pullForOtherOrg.length, 0);
  assert.equal(pullWithNoOrg.length, 0);
});
