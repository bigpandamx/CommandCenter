import { test } from "node:test";
import assert from "node:assert/strict";
import { signUpOrganization, SignupError } from "../src/signup.js";
import { FakeOrganizationsRepository } from "./fakeRepository.js";

function baseInput(overrides: Partial<Parameters<typeof signUpOrganization>[1]> = {}) {
  return {
    organizationName: "Acme Corp",
    primaryContactName: "Jane Doe",
    primaryContactEmail: "jane@acme.example",
    ...overrides,
  };
}

test("signUpOrganization creates an org on the trial tier and a matching profile", async () => {
  const repo = new FakeOrganizationsRepository();
  const now = new Date("2026-07-20T00:00:00Z");

  const result = await signUpOrganization(repo, baseInput(), now);

  assert.equal(result.organization.entitlementTier, "trial");
  assert.equal(result.organization.name, "Acme Corp");
  assert.equal(result.profile.organizationId, result.organization.id);
  assert.equal(result.profile.slug, "acme-corp");
  assert.equal(result.profile.primaryContactEmail, "jane@acme.example");
});

test("signUpOrganization assigns the organization a real, retrievable ID", async () => {
  const repo = new FakeOrganizationsRepository();
  const result = await signUpOrganization(repo, baseInput());

  const stored = await repo.getOrganization(result.organization.id);
  assert.ok(stored);
  assert.equal(stored?.id, result.organization.id);
});

test("signUpOrganization lowercases and trims the stored contact email", async () => {
  const repo = new FakeOrganizationsRepository();
  const result = await signUpOrganization(
    repo,
    baseInput({ primaryContactEmail: "  Jane@ACME.example  " }),
  );
  assert.equal(result.profile.primaryContactEmail, "jane@acme.example");
});

test("signUpOrganization rejects an empty organization name", async () => {
  const repo = new FakeOrganizationsRepository();
  await assert.rejects(
    () => signUpOrganization(repo, baseInput({ organizationName: "   " })),
    (err: unknown) => err instanceof SignupError && err.code === "invalid_name",
  );
});

test("signUpOrganization rejects a malformed email", async () => {
  const repo = new FakeOrganizationsRepository();
  await assert.rejects(
    () => signUpOrganization(repo, baseInput({ primaryContactEmail: "not-an-email" })),
    (err: unknown) => err instanceof SignupError && err.code === "invalid_email",
  );
});

test("signUpOrganization uses an explicit slug override when provided", async () => {
  const repo = new FakeOrganizationsRepository();
  const result = await signUpOrganization(repo, baseInput({ slug: "Custom Slug!" }));
  assert.equal(result.profile.slug, "custom-slug");
});

test("signUpOrganization rejects an explicit slug that's already taken", async () => {
  const repo = new FakeOrganizationsRepository();
  await signUpOrganization(repo, baseInput({ slug: "taken-slug" }));

  await assert.rejects(
    () => signUpOrganization(repo, baseInput({ organizationName: "Different Co", slug: "taken-slug" })),
    (err: unknown) => err instanceof SignupError && err.code === "slug_taken",
  );
});

test("signUpOrganization auto-generates a de-duplicated slug for two orgs with the same name", async () => {
  const repo = new FakeOrganizationsRepository();
  const first = await signUpOrganization(repo, baseInput());
  const second = await signUpOrganization(repo, baseInput({ primaryContactEmail: "other@acme.example" }));

  assert.equal(first.profile.slug, "acme-corp");
  assert.equal(second.profile.slug, "acme-corp-2");
});

test("signUpOrganization stores optional profile fields when provided, null when omitted", async () => {
  const repo = new FakeOrganizationsRepository();
  const withExtras = await signUpOrganization(
    repo,
    baseInput({
      industry: "Financial Services",
      companySize: "51-200",
      website: "https://acme.example",
      country: "US",
    }),
  );
  assert.equal(withExtras.profile.industry, "Financial Services");
  assert.equal(withExtras.profile.companySize, "51-200");

  const repo2 = new FakeOrganizationsRepository();
  const withoutExtras = await signUpOrganization(repo2, baseInput({ organizationName: "Other Co" }));
  assert.equal(withoutExtras.profile.industry, null);
  assert.equal(withoutExtras.profile.companySize, null);
});

test("signUpOrganization does not create an organization when validation fails", async () => {
  const repo = new FakeOrganizationsRepository();
  await assert.rejects(() => signUpOrganization(repo, baseInput({ primaryContactEmail: "bad" })));
  assert.equal(repo.organizations.size, 0);
});

// --- Vendor/infrastructure disclosure fields ---

test("signUpOrganization defaults cloudProviders/aiProviders/deviceTypes to empty arrays, not undefined, when not disclosed", async () => {
  const repo = new FakeOrganizationsRepository();
  const { profile } = await signUpOrganization(repo, baseInput());

  assert.deepEqual(profile.cloudProviders, []);
  assert.deepEqual(profile.aiProviders, []);
  assert.deepEqual(profile.deviceTypes, []);
});

test("signUpOrganization records a disclosed vendor footprint when provided", async () => {
  const repo = new FakeOrganizationsRepository();
  const { profile } = await signUpOrganization(
    repo,
    baseInput({ cloudProviders: ["aws"], aiProviders: ["openai", "anthropic"], deviceTypes: ["esp32"] }),
  );

  assert.deepEqual(profile.cloudProviders, ["aws"]);
  assert.deepEqual(profile.aiProviders, ["openai", "anthropic"]);
  assert.deepEqual(profile.deviceTypes, ["esp32"]);
});
