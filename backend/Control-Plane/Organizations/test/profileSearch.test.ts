import { test } from "node:test";
import assert from "node:assert/strict";
import { signUpOrganization } from "../src/signup.js";
import {
  getOrganizationWithProfile,
  findOrganizationBySlug,
  searchOrganizations,
  updateOrganizationProfile,
  ProfileError,
} from "../src/profileSearch.js";
import { FakeOrganizationsRepository } from "./fakeRepository.js";

async function seedTwoOrgs(repo: FakeOrganizationsRepository) {
  const acme = await signUpOrganization(repo, {
    organizationName: "Acme Corp",
    primaryContactName: "Jane Doe",
    primaryContactEmail: "jane@acme.example",
    industry: "Financial Services",
    companySize: "51-200",
  });
  const globex = await signUpOrganization(repo, {
    organizationName: "Globex Industries",
    primaryContactName: "John Smith",
    primaryContactEmail: "john@globex.example",
    industry: "Manufacturing",
    companySize: "1000+",
  });
  return { acme, globex };
}

test("getOrganizationWithProfile returns both records joined", async () => {
  const repo = new FakeOrganizationsRepository();
  const { acme } = await seedTwoOrgs(repo);

  const result = await getOrganizationWithProfile(repo, acme.organization.id);
  assert.equal(result.organization.name, "Acme Corp");
  assert.equal(result.profile.slug, "acme-corp");
});

test("getOrganizationWithProfile throws organization_not_found for an unknown id", async () => {
  const repo = new FakeOrganizationsRepository();
  await assert.rejects(
    () => getOrganizationWithProfile(repo, "ghost-org"),
    (err: unknown) => err instanceof ProfileError && err.code === "organization_not_found",
  );
});

test("getOrganizationWithProfile throws profile_not_found for an org with no profile (legacy/backfilled org)", async () => {
  const repo = new FakeOrganizationsRepository();
  await repo.createOrganization({
    id: "legacy-org",
    name: "Legacy Org",
    entitlementTier: "standard",
    createdAt: new Date(),
  });

  await assert.rejects(
    () => getOrganizationWithProfile(repo, "legacy-org"),
    (err: unknown) => err instanceof ProfileError && err.code === "profile_not_found",
  );
});

test("findOrganizationBySlug finds the right org", async () => {
  const repo = new FakeOrganizationsRepository();
  const { globex } = await seedTwoOrgs(repo);

  const found = await findOrganizationBySlug(repo, "globex-industries");
  assert.equal(found?.organization.id, globex.organization.id);
});

test("findOrganizationBySlug returns null for an unknown slug", async () => {
  const repo = new FakeOrganizationsRepository();
  await seedTwoOrgs(repo);
  assert.equal(await findOrganizationBySlug(repo, "does-not-exist"), null);
});

test("searchOrganizations matches by a fragment of the company name", async () => {
  const repo = new FakeOrganizationsRepository();
  const { acme } = await seedTwoOrgs(repo);

  const results = await searchOrganizations(repo, { text: "acme" });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.organization.id, acme.organization.id);
});

test("searchOrganizations matches by contact email fragment, case-insensitively", async () => {
  const repo = new FakeOrganizationsRepository();
  await seedTwoOrgs(repo);

  const results = await searchOrganizations(repo, { text: "JOHN@GLOBEX" });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.profile.primaryContactName, "John Smith");
});

test("searchOrganizations filters by industry", async () => {
  const repo = new FakeOrganizationsRepository();
  await seedTwoOrgs(repo);

  const results = await searchOrganizations(repo, { industry: "Manufacturing" });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.organization.name, "Globex Industries");
});

test("searchOrganizations filters by companySize", async () => {
  const repo = new FakeOrganizationsRepository();
  await seedTwoOrgs(repo);

  const results = await searchOrganizations(repo, { companySize: "1000+" });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.organization.name, "Globex Industries");
});

test("searchOrganizations combines text and filter criteria (AND, not OR)", async () => {
  const repo = new FakeOrganizationsRepository();
  await seedTwoOrgs(repo);

  const results = await searchOrganizations(repo, { text: "acme", industry: "Manufacturing" });
  assert.equal(results.length, 0, "Acme is Financial Services, not Manufacturing -- should not match");
});

test("searchOrganizations returns an empty array when nothing matches", async () => {
  const repo = new FakeOrganizationsRepository();
  await seedTwoOrgs(repo);
  const results = await searchOrganizations(repo, { text: "nonexistent-company-xyz" });
  assert.deepEqual(results, []);
});

test("updateOrganizationProfile applies partial updates and bumps updatedAt", async () => {
  const repo = new FakeOrganizationsRepository();
  const { acme } = await seedTwoOrgs(repo);
  const now = new Date("2026-08-01T00:00:00Z");

  const updated = await updateOrganizationProfile(
    repo,
    acme.organization.id,
    { industry: "Insurance", notes: "Upgraded plan pending" },
    now,
  );

  assert.equal(updated.industry, "Insurance");
  assert.equal(updated.notes, "Upgraded plan pending");
  assert.equal(updated.primaryContactName, "Jane Doe", "unspecified fields must be preserved, not wiped");
  assert.equal(updated.updatedAt.toISOString(), now.toISOString());
});

test("updateOrganizationProfile throws for an org with no profile", async () => {
  const repo = new FakeOrganizationsRepository();
  await assert.rejects(
    () => updateOrganizationProfile(repo, "ghost-org", { industry: "Tech" }),
    (err: unknown) => err instanceof ProfileError && err.code === "profile_not_found",
  );
});

// --- Vendor/infrastructure disclosure: search and update ---

test("updateOrganizationProfile can set a previously-undisclosed vendor footprint", async () => {
  const repo = new FakeOrganizationsRepository();
  const { organization } = await signUpOrganization(repo, {
    organizationName: "Acme Corp",
    primaryContactName: "Jane Doe",
    primaryContactEmail: "jane@acme.example",
  });

  const updated = await updateOrganizationProfile(repo, organization.id, { aiProviders: ["openai"] });

  assert.deepEqual(updated.aiProviders, ["openai"]);
});

test("searchOrganizations finds an org by a single disclosed AI provider, even among several", async () => {
  const repo = new FakeOrganizationsRepository();
  const { organization: usesOpenAi } = await signUpOrganization(repo, {
    organizationName: "Acme Corp",
    primaryContactName: "Jane Doe",
    primaryContactEmail: "jane@acme.example",
    aiProviders: ["openai", "anthropic"],
  });
  await signUpOrganization(repo, {
    organizationName: "Other Corp",
    primaryContactName: "John Doe",
    primaryContactEmail: "john@other.example",
    aiProviders: ["anthropic"],
  });

  const results = await searchOrganizations(repo, { aiProvider: "openai" });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.organization.id, usesOpenAi.id);
});

test("searchOrganizations by cloudProvider and deviceType work the same way as aiProvider", async () => {
  const repo = new FakeOrganizationsRepository();
  const { organization } = await signUpOrganization(repo, {
    organizationName: "Acme Corp",
    primaryContactName: "Jane Doe",
    primaryContactEmail: "jane@acme.example",
    cloudProviders: ["aws"],
    deviceTypes: ["esp32"],
  });

  const byCloud = await searchOrganizations(repo, { cloudProvider: "aws" });
  const byDevice = await searchOrganizations(repo, { deviceType: "esp32" });

  assert.equal(byCloud[0]?.organization.id, organization.id);
  assert.equal(byDevice[0]?.organization.id, organization.id);
});

test("searchOrganizations by vendor returns nothing when no org has disclosed using it", async () => {
  const repo = new FakeOrganizationsRepository();
  await signUpOrganization(repo, {
    organizationName: "Acme Corp",
    primaryContactName: "Jane Doe",
    primaryContactEmail: "jane@acme.example",
  });

  const results = await searchOrganizations(repo, { aiProvider: "openai" });

  assert.deepEqual(results, []);
});
