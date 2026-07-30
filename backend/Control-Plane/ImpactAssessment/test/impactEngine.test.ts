import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  assessImpact,
  assessObligationImpact,
  findAffectedOrganizations,
} from "../src/impactEngine.js";
import { ImpactAssessmentError } from "../src/types.js";
import { FakeComplianceRepository } from "../../Compliance/test/fakeRepository.js";
import { FakeOrganizationsRepository } from "../../Organizations/test/fakeRepository.js";
import { FakeServiceCatalogRepository } from "../../../Platform-Services/ServiceCatalog/test/fakeServiceCatalogRepository.js";
import { FakeBillingRepository } from "../../../Platform-Services/Subscriptions/test/fakeBillingRepository.js";
import { registerComplianceSource } from "../../Compliance/src/sourceManagement.js";
import { ingestComplianceItems } from "../../Compliance/src/ingestion.js";
import { analyzeComplianceUpdate } from "../../Compliance/src/analysisService.js";
import { FakeAIProvider } from "../../../Customer-Connections/AIChat/test/fakeAIProvider.js";
import { createControl, mapObligationToControl } from "../../Compliance/src/controlService.js";
import { createPack, addControlToPack } from "../../Compliance/src/packService.js";
import { createService, setTierAvailability } from "../../../Platform-Services/ServiceCatalog/src/serviceCatalogService.js";
import { createPlan, subscribeOrganization } from "../../../Platform-Services/Subscriptions/src/subscriptionService.js";
import type { Organization } from "../../../Customer-Connections/Desktop-Apps/src/types.js";
import type { OrganizationProfile } from "../../Organizations/src/profileTypes.js";

// --- assessImpact: the pure matching function ---

test("assessImpact: matches when country and industry both align", () => {
  const result = assessImpact(
    { country: "DE", industry: "healthcare" },
    { industries: ["healthcare"] },
    { country: "DE" },
  );
  assert.equal(result.affected, true);
  assert.ok(result.reasons.some((r) => r.includes("DE")));
  assert.ok(result.reasons.some((r) => r.includes("healthcare")));
});

test("assessImpact: excludes on a definitive country mismatch, even when industry matches", () => {
  const result = assessImpact(
    { country: "US", industry: "healthcare" },
    { industries: ["healthcare"] },
    { country: "DE" },
  );
  assert.equal(result.affected, false);
  assert.ok(result.reasons.some((r) => r.includes("DE") && r.includes("US")));
});

test("assessImpact: excludes on a definitive industry mismatch, even when country matches", () => {
  const result = assessImpact(
    { country: "DE", industry: "finance" },
    { industries: ["healthcare"] },
    { country: "DE" },
  );
  assert.equal(result.affected, false);
});

test("assessImpact: never excludes when the document doesn't specify a country -- can't be ruled out", () => {
  const result = assessImpact(
    { country: "US", industry: "healthcare" },
    { industries: ["healthcare"] },
    { country: null },
  );
  assert.equal(result.affected, true);
});

test("assessImpact: never excludes when the org's country isn't set, even if the document specifies one", () => {
  const result = assessImpact(
    { country: null, industry: "healthcare" },
    { industries: ["healthcare"] },
    { country: "DE" },
  );
  assert.equal(result.affected, true);
  assert.ok(result.reasons.some((r) => r.includes("can't be ruled out")));
});

test("assessImpact: never excludes when the obligation doesn't specify industries -- applies broadly", () => {
  const result = assessImpact(
    { country: "DE", industry: "finance" },
    { industries: [] },
    { country: "DE" },
  );
  assert.equal(result.affected, true);
});

test("assessImpact: never excludes when the org's industry isn't set, even if the obligation specifies some", () => {
  const result = assessImpact(
    { country: "DE", industry: null },
    { industries: ["healthcare"] },
    { country: "DE" },
  );
  assert.equal(result.affected, true);
  assert.ok(result.reasons.some((r) => r.includes("can't be ruled out")));
});

test("assessImpact: matches when neither country nor industry is specified on either side, with an explanatory reason", () => {
  const result = assessImpact(
    { country: null, industry: null },
    { industries: [] },
    { country: null },
  );
  assert.equal(result.affected, true);
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0] ?? "", /doesn't specify/);
});

test("assessImpact: an obligation's industries can include the org's industry among several", () => {
  const result = assessImpact(
    { country: "DE", industry: "finance" },
    { industries: ["healthcare", "finance", "insurance"] },
    { country: "DE" },
  );
  assert.equal(result.affected, true);
});

// --- assessObligationImpact / findAffectedOrganizations ---

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
) {
  const source = await registerComplianceSource(complianceRepo, {
    name: "Test Source",
    jurisdiction: "US-Federal",
    frameworkTags: [],
    sourceType: "rss",
    url: "https://example.gov/feed.xml",
  });
  await ingestComplianceItems(complianceRepo, source, [
    { externalId: "a", title: "AI Rule", summary: "s", url: "https://example.gov/a", publishedAt: null, country: documentCountry, state: null },
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

test("assessObligationImpact returns a result for every organization, affected and not", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const aiProvider = new FakeAIProvider();

  const affectedOrg = await seedOrg(orgsRepo, { country: "DE", industry: "healthcare" });
  const excludedOrg = await seedOrg(orgsRepo, { country: "US", industry: "healthcare" });
  const obligation = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"]);

  const results = await assessObligationImpact(complianceRepo, orgsRepo, catalogRepo, billingRepo, obligation.id);

  assert.equal(results.length, 2);
  const affectedResult = results.find((r) => r.organizationId === affectedOrg.id);
  const excludedResult = results.find((r) => r.organizationId === excludedOrg.id);
  assert.equal(affectedResult?.affected, true);
  assert.equal(excludedResult?.affected, false);
});

test("findAffectedOrganizations returns only the affected ones", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const aiProvider = new FakeAIProvider();

  await seedOrg(orgsRepo, { country: "DE", industry: "healthcare" });
  await seedOrg(orgsRepo, { country: "US", industry: "finance" });
  const obligation = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"]);

  const affected = await findAffectedOrganizations(complianceRepo, orgsRepo, catalogRepo, billingRepo, obligation.id);

  assert.equal(affected.length, 1);
  assert.equal(affected[0]?.reasons.some((r) => r.includes("DE")), true);
});

test("findAffectedOrganizations includes riskLevel and actionItems from the document's analysis", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const aiProvider = new FakeAIProvider();

  await seedOrg(orgsRepo, { country: "DE", industry: "healthcare" });
  const obligation = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"], "critical");

  const affected = await findAffectedOrganizations(complianceRepo, orgsRepo, catalogRepo, billingRepo, obligation.id);

  assert.equal(affected[0]?.riskLevel, "critical");
  assert.deepEqual(affected[0]?.actionItems, ["Review AI governance policy"]);
});

test("assessObligationImpact throws obligation_not_found for an unknown obligation id", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();

  await assert.rejects(
    () => assessObligationImpact(complianceRepo, orgsRepo, catalogRepo, billingRepo, "ghost-obligation"),
    (err: unknown) => err instanceof ImpactAssessmentError && err.code === "obligation_not_found",
  );
});

test("an organization with no profile set at all (both country and industry null) is never excluded", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const aiProvider = new FakeAIProvider();

  await seedOrg(orgsRepo); // country: null, industry: null, both defaults
  const obligation = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"]);

  const affected = await findAffectedOrganizations(complianceRepo, orgsRepo, catalogRepo, billingRepo, obligation.id);

  assert.equal(affected.length, 1, "an org with no profile data can't be ruled out, so it should still show up as potentially affected");
});

// --- Control-derived product impact: the additive union with country/industry ---

async function giveOrgProduct(
  catalogRepo: FakeServiceCatalogRepository,
  billingRepo: FakeBillingRepository,
  organizationId: string,
  productKey: string,
) {
  catalogRepo.planCodesByPriceAscending = ["professional"];
  await createService(catalogRepo, { key: productKey, name: productKey, description: "x", category: "ai" });
  await setTierAvailability(catalogRepo, productKey, "professional", "included");
  await createPlan(billingRepo, {
    code: "professional",
    name: "Professional",
    billingCycle: "monthly",
    basePriceCents: 9900,
    monthlyTokenQuota: null,
    monthlyRequestQuota: null,
    maxDevices: 10,
    allowedChannels: ["stable"],
  });
  await subscribeOrganization(billingRepo, organizationId, "professional");
}

test("an org excluded by country/industry is still affected via a control-derived product it owns", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const aiProvider = new FakeAIProvider();

  // DE/healthcare document+obligation; this org is US/finance -- geography alone would exclude it.
  const org = await seedOrg(orgsRepo, { country: "US", industry: "finance" });
  const obligation = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"]);

  const control = await createControl(complianceRepo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
  await mapObligationToControl(complianceRepo, obligation.id, control.key);
  const pack = await createPack(complianceRepo, { key: "ai-chat-pack", name: "AI Chat Pack", description: "x", requiredProductKeys: ["ai-chat"] });
  await addControlToPack(complianceRepo, pack.key, control.key);
  await giveOrgProduct(catalogRepo, billingRepo, org.id, "ai-chat");

  const results = await assessObligationImpact(complianceRepo, orgsRepo, catalogRepo, billingRepo, obligation.id);
  const orgResult = results.find((r) => r.organizationId === org.id)!;

  assert.equal(orgResult.affected, true, "geography excludes, but product/control ownership still includes -- union, not intersection");
  assert.ok(orgResult.reasons.some((r) => r.includes("ai-chat")), "the reasons should explain the product-derived inclusion, not just silently flip affected to true");
});

test("an org matching neither country/industry nor product/control is genuinely excluded", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const aiProvider = new FakeAIProvider();

  const org = await seedOrg(orgsRepo, { country: "US", industry: "finance" });
  const obligation = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"]);

  const control = await createControl(complianceRepo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
  await mapObligationToControl(complianceRepo, obligation.id, control.key);
  const pack = await createPack(complianceRepo, { key: "ai-chat-pack", name: "AI Chat Pack", description: "x", requiredProductKeys: ["ai-chat"] });
  await addControlToPack(complianceRepo, pack.key, control.key);
  // Note: the org is never given the "ai-chat" product this time.

  const results = await assessObligationImpact(complianceRepo, orgsRepo, catalogRepo, billingRepo, obligation.id);
  const orgResult = results.find((r) => r.organizationId === org.id)!;

  assert.equal(orgResult.affected, false);
});

test("an org matching BOTH country/industry and product/control includes reasons from both paths", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const aiProvider = new FakeAIProvider();

  const org = await seedOrg(orgsRepo, { country: "DE", industry: "healthcare" });
  const obligation = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"]);

  const control = await createControl(complianceRepo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
  await mapObligationToControl(complianceRepo, obligation.id, control.key);
  const pack = await createPack(complianceRepo, { key: "ai-chat-pack", name: "AI Chat Pack", description: "x", requiredProductKeys: ["ai-chat"] });
  await addControlToPack(complianceRepo, pack.key, control.key);
  await giveOrgProduct(catalogRepo, billingRepo, org.id, "ai-chat");

  const results = await assessObligationImpact(complianceRepo, orgsRepo, catalogRepo, billingRepo, obligation.id);
  const orgResult = results.find((r) => r.organizationId === org.id)!;

  assert.equal(orgResult.affected, true);
  assert.ok(orgResult.reasons.some((r) => r.includes("DE")), "should still include the geography reason");
  assert.ok(orgResult.reasons.some((r) => r.includes("ai-chat")), "should ALSO include the product reason, not just one or the other");
});

test("an obligation with no mapped controls at all behaves exactly like the pre-existing country/industry-only path", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const aiProvider = new FakeAIProvider();

  const org = await seedOrg(orgsRepo, { country: "US", industry: "finance" });
  const obligation = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"]);
  // No control mapped to this obligation at all -- the product chain should be a no-op.

  const results = await assessObligationImpact(complianceRepo, orgsRepo, catalogRepo, billingRepo, obligation.id);
  const orgResult = results.find((r) => r.organizationId === org.id)!;

  assert.equal(orgResult.affected, false);
  assert.equal(orgResult.reasons.some((r) => r.includes("tied to a control")), false, "no product-derived reason should appear when there's no control chain to walk");
});

test("a control mapped to the obligation but not required by any pack contributes nothing -- an incomplete chain doesn't crash or falsely include anyone", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const aiProvider = new FakeAIProvider();

  const org = await seedOrg(orgsRepo, { country: "US", industry: "finance" });
  const obligation = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"]);
  const control = await createControl(complianceRepo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
  await mapObligationToControl(complianceRepo, obligation.id, control.key);
  // No pack requires this control at all.

  const results = await assessObligationImpact(complianceRepo, orgsRepo, catalogRepo, billingRepo, obligation.id);
  const orgResult = results.find((r) => r.organizationId === org.id)!;

  assert.equal(orgResult.affected, false);
});

test("findAffectedOrganizations includes an org affected only via the product/control chain, not just country/industry", async () => {
  const complianceRepo = new FakeComplianceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const catalogRepo = new FakeServiceCatalogRepository();
  const billingRepo = new FakeBillingRepository();
  const aiProvider = new FakeAIProvider();

  const org = await seedOrg(orgsRepo, { country: "US", industry: "finance" });
  const obligation = await seedObligation(complianceRepo, aiProvider, "DE", ["healthcare"]);
  const control = await createControl(complianceRepo, { key: "ai-transparency", code: "CTRL-001", name: "AI Transparency", description: "x" });
  await mapObligationToControl(complianceRepo, obligation.id, control.key);
  const pack = await createPack(complianceRepo, { key: "ai-chat-pack", name: "AI Chat Pack", description: "x", requiredProductKeys: ["ai-chat"] });
  await addControlToPack(complianceRepo, pack.key, control.key);
  await giveOrgProduct(catalogRepo, billingRepo, org.id, "ai-chat");

  const affected = await findAffectedOrganizations(complianceRepo, orgsRepo, catalogRepo, billingRepo, obligation.id);

  assert.equal(affected.length, 1);
  assert.equal(affected[0]?.organizationId, org.id);
});
