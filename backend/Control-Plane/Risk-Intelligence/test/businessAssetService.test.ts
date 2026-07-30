import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BusinessAssetError,
  createBusinessAsset,
  listBusinessAssetsForOrganization,
  updateBusinessAsset,
  deactivateBusinessAsset,
  reactivateBusinessAsset,
} from "../src/businessAssetService.js";
import { FakeRiskIntelligenceRepository } from "./fakeRepository.js";
import { FakeOrganizationsRepository } from "../../Organizations/test/fakeRepository.js";
import { signUpOrganization } from "../../Organizations/src/signup.js";

test("createBusinessAsset rejects an unknown organization", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();

  await assert.rejects(
    () => createBusinessAsset(repo, orgsRepo, { organizationId: "ghost-org", name: "x", description: "x", category: "database", criticality: "high" }),
    (err: unknown) => err instanceof BusinessAssetError && err.code === "organization_not_found",
  );
});

test("createBusinessAsset creates an active asset by default", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization } = await signUpOrganization(orgsRepo, {
    organizationName: "Acme Corp",
    primaryContactName: "Jane Doe",
    primaryContactEmail: "jane@acme.example",
  });

  const asset = await createBusinessAsset(repo, orgsRepo, {
    organizationId: organization.id,
    name: "Customer Database",
    description: "Primary customer records store.",
    category: "database",
    criticality: "critical",
  });

  assert.equal(asset.isActive, true);
  assert.equal(asset.criticality, "critical");
});

// --- Org-scoping ---

test("listBusinessAssetsForOrganization only returns assets belonging to that organization", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization: acme } = await signUpOrganization(orgsRepo, {
    organizationName: "Acme Corp",
    primaryContactName: "Jane Doe",
    primaryContactEmail: "jane@acme.example",
  });
  const { organization: widget } = await signUpOrganization(orgsRepo, {
    organizationName: "Widget Co",
    primaryContactName: "John Doe",
    primaryContactEmail: "john@widget.example",
  });
  await createBusinessAsset(repo, orgsRepo, { organizationId: acme.id, name: "Acme's Database", description: "x", category: "database", criticality: "high" });
  await createBusinessAsset(repo, orgsRepo, { organizationId: widget.id, name: "Widget's API", description: "x", category: "api", criticality: "medium" });

  const acmeAssets = await listBusinessAssetsForOrganization(repo, orgsRepo, acme.id);

  assert.equal(acmeAssets.length, 1);
  assert.equal(acmeAssets[0]?.name, "Acme's Database");
});

test("listBusinessAssetsForOrganization rejects an unknown organization", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();

  await assert.rejects(
    () => listBusinessAssetsForOrganization(repo, orgsRepo, "ghost-org"),
    (err: unknown) => err instanceof BusinessAssetError && err.code === "organization_not_found",
  );
});

test("two organizations can have an asset with the exact same name without any conflict -- these are unrelated rows, not a shared catalog", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization: acme } = await signUpOrganization(orgsRepo, {
    organizationName: "Acme Corp",
    primaryContactName: "Jane Doe",
    primaryContactEmail: "jane@acme.example",
  });
  const { organization: widget } = await signUpOrganization(orgsRepo, {
    organizationName: "Widget Co",
    primaryContactName: "John Doe",
    primaryContactEmail: "john@widget.example",
  });

  const acmeAsset = await createBusinessAsset(repo, orgsRepo, { organizationId: acme.id, name: "Customer Database", description: "x", category: "database", criticality: "high" });
  const widgetAsset = await createBusinessAsset(repo, orgsRepo, { organizationId: widget.id, name: "Customer Database", description: "x", category: "database", criticality: "medium" });

  assert.notEqual(acmeAsset.id, widgetAsset.id);
  assert.equal(acmeAsset.name, widgetAsset.name);
});

// --- Deactivate / reactivate lifecycle ---

test("deactivateBusinessAsset marks an asset inactive without deleting it", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization } = await signUpOrganization(orgsRepo, {
    organizationName: "Acme Corp",
    primaryContactName: "Jane Doe",
    primaryContactEmail: "jane@acme.example",
  });
  const asset = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name: "Legacy System", description: "x", category: "system", criticality: "low" });

  const deactivated = await deactivateBusinessAsset(repo, asset.id);

  assert.equal(deactivated.isActive, false);
  const stillRetrievable = await repo.getBusinessAssetById(asset.id);
  assert.ok(stillRetrievable, "a deactivated asset must still exist, not be deleted");
});

test("listBusinessAssetsForOrganization with activeOnly excludes deactivated assets, without it includes them", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization } = await signUpOrganization(orgsRepo, {
    organizationName: "Acme Corp",
    primaryContactName: "Jane Doe",
    primaryContactEmail: "jane@acme.example",
  });
  const active = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name: "Active System", description: "x", category: "system", criticality: "medium" });
  const toDeactivate = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name: "Legacy System", description: "x", category: "system", criticality: "low" });
  await deactivateBusinessAsset(repo, toDeactivate.id);

  const activeOnly = await listBusinessAssetsForOrganization(repo, orgsRepo, organization.id, { activeOnly: true });
  const all = await listBusinessAssetsForOrganization(repo, orgsRepo, organization.id);

  assert.deepEqual(activeOnly.map((a) => a.id), [active.id]);
  assert.equal(all.length, 2);
});

test("reactivateBusinessAsset brings a decommissioned asset back", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization } = await signUpOrganization(orgsRepo, {
    organizationName: "Acme Corp",
    primaryContactName: "Jane Doe",
    primaryContactEmail: "jane@acme.example",
  });
  const asset = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name: "System", description: "x", category: "system", criticality: "medium" });
  await deactivateBusinessAsset(repo, asset.id);

  const reactivated = await reactivateBusinessAsset(repo, asset.id);

  assert.equal(reactivated.isActive, true);
});

// --- Updates ---

test("updateBusinessAsset updates criticality and description without touching other fields", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization } = await signUpOrganization(orgsRepo, {
    organizationName: "Acme Corp",
    primaryContactName: "Jane Doe",
    primaryContactEmail: "jane@acme.example",
  });
  const asset = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name: "Customer Database", description: "Original.", category: "database", criticality: "medium" });

  const updated = await updateBusinessAsset(repo, asset.id, { criticality: "critical", description: "Now handles PII too." });

  assert.equal(updated.criticality, "critical");
  assert.equal(updated.description, "Now handles PII too.");
  assert.equal(updated.name, "Customer Database");
  assert.equal(updated.category, "database");
});

test("updateBusinessAsset throws asset_not_found for an unknown id", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => updateBusinessAsset(repo, "ghost-asset", { criticality: "low" }),
    (err: unknown) => err instanceof BusinessAssetError && err.code === "asset_not_found",
  );
});
