import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createOrganization,
  issueEnrollmentToken,
  revokeEnrollmentToken,
  setEntitlementTier,
  OrganizationNotFoundError,
} from "../src/organizationService.js";
import { FakeOrganizationsRepository } from "./fakeRepository.js";

test("createOrganization persists and returns a new org", async () => {
  const repo = new FakeOrganizationsRepository();
  const org = await createOrganization(repo, {
    name: "Acme Corp",
    entitlementTier: "standard",
  });

  assert.ok(org.id);
  assert.equal(org.name, "Acme Corp");
  const stored = await repo.getOrganization(org.id);
  assert.deepEqual(stored, org);
});

test("issueEnrollmentToken defaults to 1 use and a 7 day TTL", async () => {
  const repo = new FakeOrganizationsRepository();
  const org = await createOrganization(repo, { name: "Acme", entitlementTier: "trial" });

  const now = new Date("2026-07-20T00:00:00Z");
  const token = await issueEnrollmentToken(repo, { organizationId: org.id }, now);

  assert.equal(token.maxUses, 1);
  assert.equal(token.useCount, 0);
  assert.equal(token.organizationId, org.id);
  assert.equal(
    token.expiresAt.getTime() - now.getTime(),
    7 * 24 * 60 * 60 * 1000,
  );
  assert.ok(token.token.startsWith("enr_"));
});

test("issueEnrollmentToken honors custom maxUses and TTL", async () => {
  const repo = new FakeOrganizationsRepository();
  const org = await createOrganization(repo, { name: "Acme", entitlementTier: "enterprise" });

  const token = await issueEnrollmentToken(repo, {
    organizationId: org.id,
    maxUses: 50,
    expiresInSeconds: 3600,
  });

  assert.equal(token.maxUses, 50);
  assert.equal(
    token.expiresAt.getTime() - token.createdAt.getTime(),
    3600 * 1000,
  );
});

test("issueEnrollmentToken rejects an unknown organization", async () => {
  const repo = new FakeOrganizationsRepository();
  await assert.rejects(
    () => issueEnrollmentToken(repo, { organizationId: "ghost-org" }),
    OrganizationNotFoundError,
  );
});

test("revokeEnrollmentToken expires the token immediately", async () => {
  const repo = new FakeOrganizationsRepository();
  const org = await createOrganization(repo, { name: "Acme", entitlementTier: "trial" });
  const token = await issueEnrollmentToken(repo, { organizationId: org.id });

  await revokeEnrollmentToken(repo, token.token);

  const listed = (await repo.listEnrollmentTokens(org.id)).find((t) => t.token === token.token);
  assert.ok(listed);
  assert.ok(listed!.expiresAt.getTime() <= Date.now());
});

test("setEntitlementTier updates the org and rejects unknown orgs", async () => {
  const repo = new FakeOrganizationsRepository();
  const org = await createOrganization(repo, { name: "Acme", entitlementTier: "trial" });

  await setEntitlementTier(repo, org.id, "enterprise");
  const updated = await repo.getOrganization(org.id);
  assert.equal(updated?.entitlementTier, "enterprise");

  await assert.rejects(
    () => setEntitlementTier(repo, "ghost-org", "enterprise"),
    OrganizationNotFoundError,
  );
});
