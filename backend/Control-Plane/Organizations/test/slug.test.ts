import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, generateUniqueSlug } from "../src/slug.js";
import { FakeOrganizationsRepository } from "./fakeRepository.js";
import type { OrganizationProfile } from "../src/profileTypes.js";

function fakeProfile(organizationId: string, slug: string): OrganizationProfile {
  return {
    organizationId,
    slug,
    primaryContactName: "Someone",
    primaryContactEmail: "someone@example.com",
    primaryContactPhone: null,
    industry: null,
    companySize: null,
    website: null,
    country: null,
    notes: null,
    cloudProviders: [],
    aiProviders: [],
    deviceTypes: [],
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

test("slugify lowercases and hyphenates a typical company name", () => {
  assert.equal(slugify("Acme Corp"), "acme-corp");
});

test("slugify strips punctuation instead of preserving it as hyphens", () => {
  assert.equal(slugify("Acme, Inc. & Co."), "acme-inc-co");
});

test("slugify collapses repeated separators and trims leading/trailing hyphens", () => {
  assert.equal(slugify("  --Acme   Corp--  "), "acme-corp");
});

test("slugify handles a name that's entirely punctuation by returning an empty string (caller's problem to handle)", () => {
  assert.equal(slugify("!!!"), "");
});

test("generateUniqueSlug uses the plain slugified name when it's not taken", async () => {
  const repo = new FakeOrganizationsRepository();
  const slug = await generateUniqueSlug(repo, "Acme Corp");
  assert.equal(slug, "acme-corp");
});

test("generateUniqueSlug appends -2 when the base slug is already taken", async () => {
  const repo = new FakeOrganizationsRepository();
  await repo.createProfile(fakeProfile("existing-org-id", "acme-corp"));

  const slug = await generateUniqueSlug(repo, "Acme Corp");
  assert.equal(slug, "acme-corp-2");
});

test("generateUniqueSlug keeps incrementing past multiple collisions", async () => {
  const repo = new FakeOrganizationsRepository();
  await repo.createProfile(fakeProfile("org-1", "acme-corp"));
  await repo.createProfile(fakeProfile("org-2", "acme-corp-2"));
  await repo.createProfile(fakeProfile("org-3", "acme-corp-3"));

  const slug = await generateUniqueSlug(repo, "Acme Corp");
  assert.equal(slug, "acme-corp-4");
});

test("generateUniqueSlug falls back to 'org' as the base when the name slugifies to nothing", async () => {
  const repo = new FakeOrganizationsRepository();
  const slug = await generateUniqueSlug(repo, "!!!");
  assert.equal(slug, "org");
});
