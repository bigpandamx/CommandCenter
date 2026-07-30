import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assessRiskImpactForIndustry, findOrganizationsAffectedByIndustryRisk } from "../src/organizationImpactService.js";
import { FakeOrganizationsRepository } from "../../Organizations/test/fakeRepository.js";

async function seedOrgInIndustry(orgsRepo: FakeOrganizationsRepository, industry: string | null) {
  const orgId = randomUUID();
  await orgsRepo.createOrganization({ id: orgId, name: `Org ${orgId}`, entitlementTier: "standard", createdAt: new Date() });
  await orgsRepo.createProfile({
    organizationId: orgId,
    slug: orgId,
    primaryContactName: "Contact",
    primaryContactEmail: "contact@example.com",
    primaryContactPhone: null,
    industry,
    companySize: null,
    website: null,
    country: null,
    notes: null,
    cloudProviders: [],
    aiProviders: [],
    deviceTypes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return orgId;
}

test("assessRiskImpactForIndustry returns every organization, affected or not -- the same 'show who was excluded' shape as Compliance's own assessment", async () => {
  const orgsRepo = new FakeOrganizationsRepository();
  await seedOrgInIndustry(orgsRepo, "technology");
  await seedOrgInIndustry(orgsRepo, "healthcare");

  const results = await assessRiskImpactForIndustry(orgsRepo, "technology");

  assert.equal(results.length, 2);
  assert.equal(results.filter((r) => r.affected).length, 1);
  assert.equal(results.filter((r) => !r.affected).length, 1);
});

test("an org in the matching industry is affected, with a real reason", async () => {
  const orgsRepo = new FakeOrganizationsRepository();
  const orgId = await seedOrgInIndustry(orgsRepo, "technology");

  const results = await assessRiskImpactForIndustry(orgsRepo, "technology");
  const result = results.find((r) => r.organizationId === orgId);

  assert.equal(result?.affected, true);
  assert.ok(result?.reasons.some((r) => r.includes("technology")));
});

test("an org in a different industry is excluded, with a real reason naming both industries", async () => {
  const orgsRepo = new FakeOrganizationsRepository();
  const orgId = await seedOrgInIndustry(orgsRepo, "healthcare");

  const results = await assessRiskImpactForIndustry(orgsRepo, "technology");
  const result = results.find((r) => r.organizationId === orgId);

  assert.equal(result?.affected, false);
  assert.ok(result?.reasons.some((r) => r.includes("technology") && r.includes("healthcare")));
});

test("an org with no industry set is excluded, not included -- deliberately different from Compliance's own default", async () => {
  const orgsRepo = new FakeOrganizationsRepository();
  const orgId = await seedOrgInIndustry(orgsRepo, null);

  const results = await assessRiskImpactForIndustry(orgsRepo, "technology");
  const result = results.find((r) => r.organizationId === orgId);

  assert.equal(result?.affected, false);
});

test("findOrganizationsAffectedByIndustryRisk returns only the affected subset", async () => {
  const orgsRepo = new FakeOrganizationsRepository();
  const techOrg = await seedOrgInIndustry(orgsRepo, "technology");
  await seedOrgInIndustry(orgsRepo, "healthcare");
  await seedOrgInIndustry(orgsRepo, null);

  const affected = await findOrganizationsAffectedByIndustryRisk(orgsRepo, "technology");

  assert.equal(affected.length, 1);
  assert.equal(affected[0]?.organizationId, techOrg);
});

test("findOrganizationsAffectedByIndustryRisk returns an empty array when nothing matches", async () => {
  const orgsRepo = new FakeOrganizationsRepository();
  await seedOrgInIndustry(orgsRepo, "healthcare");

  const affected = await findOrganizationsAffectedByIndustryRisk(orgsRepo, "technology");

  assert.deepEqual(affected, []);
});
