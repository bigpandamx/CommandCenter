import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AssetDependencyError,
  createAssetDependency,
  listDependenciesForAsset,
  listDependentsOfAsset,
  listAssetsDependentOnVendor,
  deleteAssetDependency,
  listTransitiveDependentsOfAsset,
  listTransitiveDependentsOfVendor,
} from "../src/assetDependencyService.js";
import { createBusinessAsset } from "../src/businessAssetService.js";
import { FakeRiskIntelligenceRepository } from "./fakeRepository.js";
import { FakeOrganizationsRepository } from "../../Organizations/test/fakeRepository.js";
import { signUpOrganization } from "../../Organizations/src/signup.js";

async function seedOrgAndAsset(repo: FakeRiskIntelligenceRepository, orgsRepo: FakeOrganizationsRepository, name: string) {
  const { organization } = await signUpOrganization(orgsRepo, {
    organizationName: `Org for ${name}`,
    primaryContactName: "Jane Doe",
    primaryContactEmail: `${name.toLowerCase().replace(/\s+/g, "-")}@example.com`,
  });
  const asset = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name, description: "x", category: "system", criticality: "medium" });
  return { organization, asset };
}

test("createAssetDependency rejects an unknown dependent asset", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => createAssetDependency(repo, { dependentAssetId: "ghost-asset", targetType: "vendor", targetVendor: "openai", targetVendorCategory: "ai", description: "x", criticality: "high" }),
    (err: unknown) => err instanceof AssetDependencyError && err.code === "asset_not_found",
  );
});

// --- Vendor-target dependencies ---

test("createAssetDependency creates a vendor-target dependency successfully", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { asset } = await seedOrgAndAsset(repo, orgsRepo, "AI Support Triage");

  const dep = await createAssetDependency(repo, {
    dependentAssetId: asset.id,
    targetType: "vendor",
    targetVendor: "openai",
    targetVendorCategory: "ai",
    description: "Relies on OpenAI for triage classification.",
    criticality: "high",
  });

  assert.equal(dep.targetVendor, "openai");
  assert.equal(dep.targetAssetId, null, "a vendor-target dependency must not carry an asset target");
});

// --- Asset-target dependencies: validation ---

test("createAssetDependency rejects an asset depending on itself", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { asset } = await seedOrgAndAsset(repo, orgsRepo, "Payment Processing");

  await assert.rejects(
    () => createAssetDependency(repo, { dependentAssetId: asset.id, targetType: "asset", targetAssetId: asset.id, description: "x", criticality: "high" }),
    (err: unknown) => err instanceof AssetDependencyError && err.code === "self_dependency",
  );
});

test("createAssetDependency rejects an unknown target asset", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { asset } = await seedOrgAndAsset(repo, orgsRepo, "Payment Processing");

  await assert.rejects(
    () => createAssetDependency(repo, { dependentAssetId: asset.id, targetType: "asset", targetAssetId: "ghost-target", description: "x", criticality: "high" }),
    (err: unknown) => err instanceof AssetDependencyError && err.code === "target_asset_not_found",
  );
});

test("createAssetDependency rejects a target asset belonging to a different organization", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { asset: acmeAsset } = await seedOrgAndAsset(repo, orgsRepo, "Acme System");
  const { asset: widgetAsset } = await seedOrgAndAsset(repo, orgsRepo, "Widget System");

  await assert.rejects(
    () => createAssetDependency(repo, { dependentAssetId: acmeAsset.id, targetType: "asset", targetAssetId: widgetAsset.id, description: "x", criticality: "high" }),
    (err: unknown) => err instanceof AssetDependencyError && err.code === "cross_organization_target",
  );
});

test("createAssetDependency creates a valid asset-target dependency within the same organization", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization } = await seedOrgAndAsset(repo, orgsRepo, "seed"); // just to get an org
  const database = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name: "Customer Database", description: "x", category: "database", criticality: "critical" });
  const paymentSystem = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name: "Payment Processing", description: "x", category: "system", criticality: "critical" });

  const dep = await createAssetDependency(repo, {
    dependentAssetId: paymentSystem.id,
    targetType: "asset",
    targetAssetId: database.id,
    description: "Reads customer billing info from the database.",
    criticality: "critical",
  });

  assert.equal(dep.targetAssetId, database.id);
  assert.equal(dep.targetVendor, null, "an asset-target dependency must not carry a vendor target");
});

// --- The direct-reverse-pair rejection ---

test("createAssetDependency rejects the direct reverse of an existing dependency (A->B exists, B->A is rejected)", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization } = await seedOrgAndAsset(repo, orgsRepo, "seed");
  const assetA = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name: "A", description: "x", category: "system", criticality: "medium" });
  const assetB = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name: "B", description: "x", category: "system", criticality: "medium" });

  await createAssetDependency(repo, { dependentAssetId: assetA.id, targetType: "asset", targetAssetId: assetB.id, description: "A depends on B", criticality: "medium" });

  await assert.rejects(
    () => createAssetDependency(repo, { dependentAssetId: assetB.id, targetType: "asset", targetAssetId: assetA.id, description: "B depends on A", criticality: "medium" }),
    (err: unknown) => err instanceof AssetDependencyError && err.code === "reverse_dependency_exists",
  );
});

test("createAssetDependency allows two SEPARATE, non-reversing dependencies between three assets (A->B, B->C is fine)", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization } = await seedOrgAndAsset(repo, orgsRepo, "seed");
  const assetA = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name: "A", description: "x", category: "system", criticality: "medium" });
  const assetB = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name: "B", description: "x", category: "system", criticality: "medium" });
  const assetC = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name: "C", description: "x", category: "system", criticality: "medium" });

  await createAssetDependency(repo, { dependentAssetId: assetA.id, targetType: "asset", targetAssetId: assetB.id, description: "x", criticality: "medium" });
  // Not rejected -- B->C is a different pair from A->B, not its reverse.
  const dep = await createAssetDependency(repo, { dependentAssetId: assetB.id, targetType: "asset", targetAssetId: assetC.id, description: "x", criticality: "medium" });

  assert.equal(dep.targetAssetId, assetC.id);
});

// --- Traversal: what depends on what ---

test("listDependenciesForAsset returns what the asset itself depends on", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { asset } = await seedOrgAndAsset(repo, orgsRepo, "AI Support Triage");
  await createAssetDependency(repo, { dependentAssetId: asset.id, targetType: "vendor", targetVendor: "openai", targetVendorCategory: "ai", description: "x", criticality: "high" });

  const deps = await listDependenciesForAsset(repo, asset.id);

  assert.equal(deps.length, 1);
});

test("listDependentsOfAsset returns the reverse -- what depends ON this asset", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization } = await seedOrgAndAsset(repo, orgsRepo, "seed");
  const database = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name: "Customer Database", description: "x", category: "database", criticality: "critical" });
  const paymentSystem = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name: "Payment Processing", description: "x", category: "system", criticality: "critical" });
  await createAssetDependency(repo, { dependentAssetId: paymentSystem.id, targetType: "asset", targetAssetId: database.id, description: "x", criticality: "critical" });

  const dependents = await listDependentsOfAsset(repo, database.id);

  assert.equal(dependents.length, 1);
  assert.equal(dependents[0]?.dependentAssetId, paymentSystem.id);
});

// --- The load-bearing cascade query: vendor outage -> affected assets ---

test("listAssetsDependentOnVendor finds the specific assets that depend on a vendor -- the actual OpenAI-outage scenario", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization } = await seedOrgAndAsset(repo, orgsRepo, "seed");
  const supportTriage = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name: "AI Support Triage", description: "x", category: "system", criticality: "high" });
  const contentModeration = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name: "Content Moderation", description: "x", category: "system", criticality: "critical" });
  const unrelatedSystem = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name: "Payroll", description: "x", category: "system", criticality: "medium" });

  await createAssetDependency(repo, { dependentAssetId: supportTriage.id, targetType: "vendor", targetVendor: "openai", targetVendorCategory: "ai", description: "x", criticality: "high" });
  await createAssetDependency(repo, { dependentAssetId: contentModeration.id, targetType: "vendor", targetVendor: "openai", targetVendorCategory: "ai", description: "x", criticality: "critical" });
  await createAssetDependency(repo, { dependentAssetId: unrelatedSystem.id, targetType: "vendor", targetVendor: "aws", targetVendorCategory: "cloud", description: "x", criticality: "medium" });

  const affected = await listAssetsDependentOnVendor(repo, organization.id, "openai", "ai");

  assert.equal(affected.length, 2);
  assert.deepEqual(new Set(affected.map((d) => d.dependentAssetId)), new Set([supportTriage.id, contentModeration.id]));
});

test("listAssetsDependentOnVendor does not cross-match category -- an org using OpenAI as an AI provider isn't found when the vendor outage is filed under 'cloud'", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization, asset } = await seedOrgAndAsset(repo, orgsRepo, "AI Support Triage");
  await createAssetDependency(repo, { dependentAssetId: asset.id, targetType: "vendor", targetVendor: "openai", targetVendorCategory: "ai", description: "x", criticality: "high" });

  const wrongCategoryResults = await listAssetsDependentOnVendor(repo, organization.id, "openai", "cloud");

  assert.deepEqual(wrongCategoryResults, []);
});

test("listAssetsDependentOnVendor returns an empty array when no asset depends on this vendor -- not an error", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization } = await seedOrgAndAsset(repo, orgsRepo, "seed");

  const affected = await listAssetsDependentOnVendor(repo, organization.id, "openai", "ai");

  assert.deepEqual(affected, []);
});

// --- Deletion ---

test("deleteAssetDependency removes the dependency", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { asset } = await seedOrgAndAsset(repo, orgsRepo, "AI Support Triage");
  const dep = await createAssetDependency(repo, { dependentAssetId: asset.id, targetType: "vendor", targetVendor: "openai", targetVendorCategory: "ai", description: "x", criticality: "high" });

  await deleteAssetDependency(repo, dep.id);

  const remaining = await listDependenciesForAsset(repo, asset.id);
  assert.deepEqual(remaining, []);
});

test("deleteAssetDependency throws dependency_not_found for an unknown id", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  await assert.rejects(
    () => deleteAssetDependency(repo, "ghost-dependency"),
    (err: unknown) => err instanceof AssetDependencyError && err.code === "dependency_not_found",
  );
});

// --- Multi-hop cascade traversal ---

async function seedChainOrg(repo: FakeRiskIntelligenceRepository, orgsRepo: FakeOrganizationsRepository, assetNames: string[]) {
  const { organization } = await signUpOrganization(orgsRepo, {
    organizationName: `Chain Org ${Math.random()}`,
    primaryContactName: "Jane Doe",
    primaryContactEmail: `chain-${Math.random()}@example.com`,
  });
  const assets: Record<string, string> = {};
  for (const name of assetNames) {
    const asset = await createBusinessAsset(repo, orgsRepo, { organizationId: organization.id, name, description: "x", category: "system", criticality: "medium" });
    assets[name] = asset.id;
  }
  return { organization, assets };
}

test("listTransitiveDependentsOfAsset finds a multi-hop chain, in correct depth order (A<-B<-C<-D)", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { assets } = await seedChainOrg(repo, orgsRepo, ["A", "B", "C", "D"]);
  // B depends on A, C depends on B, D depends on C -- a chain three hops long.
  await createAssetDependency(repo, { dependentAssetId: assets.B!, targetType: "asset", targetAssetId: assets.A!, description: "x", criticality: "medium" });
  await createAssetDependency(repo, { dependentAssetId: assets.C!, targetType: "asset", targetAssetId: assets.B!, description: "x", criticality: "medium" });
  await createAssetDependency(repo, { dependentAssetId: assets.D!, targetType: "asset", targetAssetId: assets.C!, description: "x", criticality: "medium" });

  const result = await listTransitiveDependentsOfAsset(repo, assets.A!);

  assert.equal(result.length, 3, "B, C, and D should all be found, not just the direct dependent B");
  const byId = Object.fromEntries(result.map((r) => [r.assetId, r]));
  assert.equal(byId[assets.B!]?.depth, 1);
  assert.equal(byId[assets.C!]?.depth, 2);
  assert.equal(byId[assets.D!]?.depth, 3);
  assert.deepEqual(byId[assets.D!]?.path, [assets.A!, assets.B!, assets.C!, assets.D!]);
});

test("listTransitiveDependentsOfAsset finds the shortest path when an asset is reachable two ways (a diamond)", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { assets } = await seedChainOrg(repo, orgsRepo, ["A", "B", "C", "D"]);
  // B depends on A, C depends on A, D depends on BOTH B and C -- a diamond, D reachable via two length-2 paths.
  await createAssetDependency(repo, { dependentAssetId: assets.B!, targetType: "asset", targetAssetId: assets.A!, description: "x", criticality: "medium" });
  await createAssetDependency(repo, { dependentAssetId: assets.C!, targetType: "asset", targetAssetId: assets.A!, description: "x", criticality: "medium" });
  await createAssetDependency(repo, { dependentAssetId: assets.D!, targetType: "asset", targetAssetId: assets.B!, description: "x", criticality: "medium" });
  await createAssetDependency(repo, { dependentAssetId: assets.D!, targetType: "asset", targetAssetId: assets.C!, description: "x", criticality: "medium" });

  const result = await listTransitiveDependentsOfAsset(repo, assets.A!);

  const dEntries = result.filter((r) => r.assetId === assets.D!);
  assert.equal(dEntries.length, 1, "D must appear exactly once, not once per path that reaches it");
  assert.equal(dEntries[0]?.depth, 2, "D's recorded depth must be its SHORTEST distance from the origin");
});

// --- The load-bearing correctness guarantee: genuine cycle safety ---

test("listTransitiveDependentsOfAsset terminates and returns correct results even when a real 3-node cycle exists in the graph", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { assets } = await seedChainOrg(repo, orgsRepo, ["A", "B", "C"]);
  // B depends on A, C depends on B -- both individually valid.
  await createAssetDependency(repo, { dependentAssetId: assets.B!, targetType: "asset", targetAssetId: assets.A!, description: "x", criticality: "medium" });
  await createAssetDependency(repo, { dependentAssetId: assets.C!, targetType: "asset", targetAssetId: assets.B!, description: "x", criticality: "medium" });
  // A depends on C -- NOT the direct reverse of any single existing dependency (A->B and B->A would be
  // rejected, but this is A->C, a different pair), so createAssetDependency must allow it, completing a
  // genuine A -> B -> C -> A cycle that only the multi-hop traversal itself needs to survive.
  const cycleCloser = await createAssetDependency(repo, { dependentAssetId: assets.A!, targetType: "asset", targetAssetId: assets.C!, description: "x", criticality: "medium" });
  assert.ok(cycleCloser, "confirms the write-time check genuinely allows this longer cycle to be created");

  const result = await listTransitiveDependentsOfAsset(repo, assets.A!);

  // Must terminate (the test itself terminating proves this) and must not contain duplicates.
  const ids = result.map((r) => r.assetId);
  assert.deepEqual(new Set(ids).size, ids.length, "no asset should appear more than once despite the cycle");
  assert.deepEqual(new Set(ids), new Set([assets.B!, assets.C!]), "B and C are transitively affected; A itself (the origin) should not appear in its own result");
});

test("listTransitiveDependentsOfAsset respects a custom maxDepth, truncating a longer chain", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { assets } = await seedChainOrg(repo, orgsRepo, ["A", "B", "C", "D", "E"]);
  await createAssetDependency(repo, { dependentAssetId: assets.B!, targetType: "asset", targetAssetId: assets.A!, description: "x", criticality: "medium" });
  await createAssetDependency(repo, { dependentAssetId: assets.C!, targetType: "asset", targetAssetId: assets.B!, description: "x", criticality: "medium" });
  await createAssetDependency(repo, { dependentAssetId: assets.D!, targetType: "asset", targetAssetId: assets.C!, description: "x", criticality: "medium" });
  await createAssetDependency(repo, { dependentAssetId: assets.E!, targetType: "asset", targetAssetId: assets.D!, description: "x", criticality: "medium" });

  const result = await listTransitiveDependentsOfAsset(repo, assets.A!, { maxDepth: 2 });

  assert.deepEqual(new Set(result.map((r) => r.assetId)), new Set([assets.B!, assets.C!]), "only depth 1 and 2 should be included when maxDepth is 2");
});

test("listTransitiveDependentsOfAsset returns an empty array for an asset nothing depends on, even transitively", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { assets } = await seedChainOrg(repo, orgsRepo, ["A"]);

  const result = await listTransitiveDependentsOfAsset(repo, assets.A!);

  assert.deepEqual(result, []);
});

// --- Vendor-rooted cascade ---

test("listTransitiveDependentsOfVendor finds direct vendor dependents AND what cascades from them", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization, assets } = await seedChainOrg(repo, orgsRepo, ["SupportTriage", "TicketRouter"]);
  // SupportTriage depends directly on OpenAI.
  await createAssetDependency(repo, { dependentAssetId: assets.SupportTriage!, targetType: "vendor", targetVendor: "openai", targetVendorCategory: "ai", description: "x", criticality: "high" });
  // TicketRouter depends on SupportTriage -- transitively affected by an OpenAI outage, one hop further.
  await createAssetDependency(repo, { dependentAssetId: assets.TicketRouter!, targetType: "asset", targetAssetId: assets.SupportTriage!, description: "x", criticality: "medium" });

  const result = await listTransitiveDependentsOfVendor(repo, organization.id, "openai", "ai");

  assert.equal(result.length, 2);
  const byId = Object.fromEntries(result.map((r) => [r.assetId, r]));
  assert.equal(byId[assets.SupportTriage!]?.depth, 1);
  assert.equal(byId[assets.TicketRouter!]?.depth, 2);
});

test("listTransitiveDependentsOfVendor de-duplicates an asset reachable through more than one direct vendor dependent", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization, assets } = await seedChainOrg(repo, orgsRepo, ["ServiceA", "ServiceB", "SharedDownstream"]);
  await createAssetDependency(repo, { dependentAssetId: assets.ServiceA!, targetType: "vendor", targetVendor: "openai", targetVendorCategory: "ai", description: "x", criticality: "high" });
  await createAssetDependency(repo, { dependentAssetId: assets.ServiceB!, targetType: "vendor", targetVendor: "openai", targetVendorCategory: "ai", description: "x", criticality: "high" });
  await createAssetDependency(repo, { dependentAssetId: assets.SharedDownstream!, targetType: "asset", targetAssetId: assets.ServiceA!, description: "x", criticality: "medium" });
  await createAssetDependency(repo, { dependentAssetId: assets.SharedDownstream!, targetType: "asset", targetAssetId: assets.ServiceB!, description: "x", criticality: "medium" });

  const result = await listTransitiveDependentsOfVendor(repo, organization.id, "openai", "ai");

  const sharedEntries = result.filter((r) => r.assetId === assets.SharedDownstream!);
  assert.equal(sharedEntries.length, 1, "SharedDownstream is reachable via both ServiceA and ServiceB but must appear only once");
});

test("listTransitiveDependentsOfVendor returns an empty array when nothing depends on the vendor at all", async () => {
  const repo = new FakeRiskIntelligenceRepository();
  const orgsRepo = new FakeOrganizationsRepository();
  const { organization } = await seedChainOrg(repo, orgsRepo, []);

  const result = await listTransitiveDependentsOfVendor(repo, organization.id, "openai", "ai");

  assert.deepEqual(result, []);
});
