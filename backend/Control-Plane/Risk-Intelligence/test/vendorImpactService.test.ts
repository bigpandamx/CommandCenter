import { test } from "node:test";
import assert from "node:assert/strict";
import { findOrganizationsUsingVendor } from "../src/vendorImpactService.js";
import { signUpOrganization } from "../../Organizations/src/signup.js";
import { FakeOrganizationsRepository } from "../../Organizations/test/fakeRepository.js";

test("findOrganizationsUsingVendor finds only organizations that disclosed using this specific AI provider", async () => {
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization: usesOpenAi } = await signUpOrganization(orgsRepo, {
    organizationName: "Acme Corp",
    primaryContactName: "Jane Doe",
    primaryContactEmail: "jane@acme.example",
    aiProviders: ["openai"],
  });
  await signUpOrganization(orgsRepo, {
    organizationName: "Other Corp",
    primaryContactName: "John Doe",
    primaryContactEmail: "john@other.example",
    aiProviders: ["anthropic"],
  });

  const results = await findOrganizationsUsingVendor(orgsRepo, "openai", "ai");

  assert.equal(results.length, 1);
  assert.equal(results[0]?.organizationId, usesOpenAi.id);
  assert.equal(results[0]?.category, "ai");
});

test("findOrganizationsUsingVendor works for cloud and device categories too, not just ai", async () => {
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization } = await signUpOrganization(orgsRepo, {
    organizationName: "Acme Corp",
    primaryContactName: "Jane Doe",
    primaryContactEmail: "jane@acme.example",
    cloudProviders: ["aws"],
    deviceTypes: ["esp32"],
  });

  const cloudResults = await findOrganizationsUsingVendor(orgsRepo, "aws", "cloud");
  const deviceResults = await findOrganizationsUsingVendor(orgsRepo, "esp32", "device");

  assert.equal(cloudResults[0]?.organizationId, organization.id);
  assert.equal(deviceResults[0]?.organizationId, organization.id);
});

test("findOrganizationsUsingVendor returns an empty array when no organization discloses using it -- not an error", async () => {
  const orgsRepo = new FakeOrganizationsRepository();
  await signUpOrganization(orgsRepo, {
    organizationName: "Acme Corp",
    primaryContactName: "Jane Doe",
    primaryContactEmail: "jane@acme.example",
  });

  const results = await findOrganizationsUsingVendor(orgsRepo, "openai", "ai");

  assert.deepEqual(results, []);
});

test("findOrganizationsUsingVendor does not cross-match categories -- an org using OpenAI as an AI provider isn't found when searching cloud providers for 'openai'", async () => {
  const orgsRepo = new FakeOrganizationsRepository();
  await signUpOrganization(orgsRepo, {
    organizationName: "Acme Corp",
    primaryContactName: "Jane Doe",
    primaryContactEmail: "jane@acme.example",
    aiProviders: ["openai"],
  });

  const wrongCategoryResults = await findOrganizationsUsingVendor(orgsRepo, "openai", "cloud");

  assert.deepEqual(wrongCategoryResults, []);
});
