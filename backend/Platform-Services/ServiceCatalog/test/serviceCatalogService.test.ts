import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDependency,
  addServiceToBundle,
  attachAddOn,
  attachBundle,
  cancelAddOn,
  cancelBundle,
  computeCatalogForOrganization,
  computeCategorizedCatalogForOrganization,
  computeFinalEntitlements,
  computeNavigationForOrganization,
  computeServiceAvailability,
  computeTierProgression,
  createBundle,
  createCategory,
  createService,
  disableService,
  editService,
  listCategories,
  listServiceDependencies,
  removeDependency,
  removeServiceFromBundle,
  resolveDependencyRequirements,
  resolveDisableOverride,
  setTierAvailability,
} from "../src/serviceCatalogService.js";
import { ServiceCatalogError } from "../src/types.js";
import { FakeServiceCatalogRepository } from "./fakeServiceCatalogRepository.js";
import { createFlag, setFlagEnabled } from "../../FeatureFlags/src/featureFlagService.js";
import { FakeFeatureFlagsRepository } from "../../FeatureFlags/test/fakeFeatureFlagsRepository.js";

const ORG_ID = "org-1";

async function setupCatalog(repo: FakeServiceCatalogRepository) {
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];
  await createService(repo, { key: "developer-sandbox", name: "Developer Sandbox", description: "Test AI models in a sandboxed environment", category: "developer" });
  await createService(repo, { key: "sso", name: "Single Sign-On", description: "SAML/OIDC login", category: "identity" });
  await createService(repo, { key: "core-identity", name: "Core Identity", description: "Basic auth", category: "identity" });
}

// ---------------------------------------------------------------------
// Catalog management
// ---------------------------------------------------------------------

test("createService rejects an invalid key format", async () => {
  const repo = new FakeServiceCatalogRepository();
  await assert.rejects(
    () => createService(repo, { key: "Developer Sandbox!", name: "x", description: "x", category: "x" }),
    (err: unknown) => err instanceof ServiceCatalogError && err.code === "invalid_key",
  );
});

test("createService rejects a duplicate key", async () => {
  const repo = new FakeServiceCatalogRepository();
  await createService(repo, { key: "sso", name: "SSO", description: "x", category: "identity" });
  await assert.rejects(
    () => createService(repo, { key: "sso", name: "SSO again", description: "x", category: "identity" }),
    (err: unknown) => err instanceof ServiceCatalogError && err.code === "duplicate_key",
  );
});

test("setTierAvailability creates then updates the same cell rather than erroring on a second call", async () => {
  const repo = new FakeServiceCatalogRepository();
  await createService(repo, { key: "sso", name: "SSO", description: "x", category: "identity" });

  await setTierAvailability(repo, "sso", "enterprise", "included");
  const updated = await setTierAvailability(repo, "sso", "enterprise", "addable", "price_123");

  const all = await repo.listTierAvailabilityForService((await repo.getServiceByKey("sso"))!.id);
  assert.equal(all.length, 1); // still one row, not two
  assert.equal(updated.availabilityType, "addable");
  assert.equal(updated.addOnStripePriceId, "price_123");
});

// ---------------------------------------------------------------------
// State computation: included / unavailable (no selection involved)
// ---------------------------------------------------------------------

test("a service included at the org's tier is available", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "core-identity", "foundation", "included");

  const result = await computeServiceAvailability(repo, ORG_ID, "core-identity", "foundation");
  assert.deepEqual(result, { state: "available", source: "tier_included" });
});

test("a service with no tier row at all defaults to unavailable, not a crash", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);

  const result = await computeServiceAvailability(repo, ORG_ID, "developer-sandbox", "foundation");
  assert.equal(result.state, "locked");
});

test("a service explicitly unavailable at this tier is locked with an upgrade_tier path to the nearest tier that offers it", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "sso", "foundation", "unavailable");
  await setTierAvailability(repo, "sso", "professional", "unavailable");
  await setTierAvailability(repo, "sso", "enterprise", "included");

  const result = await computeServiceAvailability(repo, ORG_ID, "sso", "foundation");
  assert.equal(result.state, "locked");
  if (result.state === "locked") {
    assert.deepEqual(result.unlockPath, { type: "upgrade_tier", targetPlanCode: "enterprise" });
  }
});

test("upgrade_tier path finds the CHEAPEST tier that offers it, not just any tier", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "sso", "foundation", "unavailable");
  await setTierAvailability(repo, "sso", "professional", "addable", "price_pro_sso");
  await setTierAvailability(repo, "sso", "enterprise", "included");

  const result = await computeServiceAvailability(repo, ORG_ID, "sso", "foundation");
  assert.equal(result.state, "locked");
  if (result.state === "locked" && result.unlockPath.type === "upgrade_tier") {
    assert.equal(result.unlockPath.targetPlanCode, "professional");
  } else {
    assert.fail("expected an upgrade_tier unlock path");
  }
});

test("a service not offered at ANY tier still returns a locked state, not a crash", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "sso", "foundation", "unavailable");
  await setTierAvailability(repo, "sso", "professional", "unavailable");
  await setTierAvailability(repo, "sso", "enterprise", "unavailable");

  const result = await computeServiceAvailability(repo, ORG_ID, "sso", "foundation");
  assert.equal(result.state, "locked");
});

// ---------------------------------------------------------------------
// State computation: addable + org selections
// ---------------------------------------------------------------------

test("an addable service with no selection is locked with an add_on path, not upgrade_tier", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "developer-sandbox", "professional", "addable", "price_dev_sandbox");

  const result = await computeServiceAvailability(repo, ORG_ID, "developer-sandbox", "professional");
  assert.equal(result.state, "locked");
  if (result.state === "locked") {
    assert.deepEqual(result.unlockPath, {
      type: "add_on",
      serviceId: (await repo.getServiceByKey("developer-sandbox"))!.id,
      addOnStripePriceId: "price_dev_sandbox",
    });
  }
});

test("attachAddOn refuses to attach a service that isn't addable at the org's current tier", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "sso", "foundation", "unavailable");

  await assert.rejects(
    () => attachAddOn(repo, ORG_ID, "sso", "foundation"),
    (err: unknown) => err instanceof ServiceCatalogError && err.code === "plan_not_found",
  );
});

test("attachAddOn refuses to attach a service that's already included (nothing to attach)", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "core-identity", "foundation", "included");

  await assert.rejects(() => attachAddOn(repo, ORG_ID, "core-identity", "foundation"));
});

test("after attachAddOn, the service becomes available", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "developer-sandbox", "professional", "addable", "price_dev_sandbox");

  await attachAddOn(repo, ORG_ID, "developer-sandbox", "professional");
  const result = await computeServiceAvailability(repo, ORG_ID, "developer-sandbox", "professional");
  assert.deepEqual(result, { state: "available", source: "add_on" });
});

test("attachAddOn with trial: true produces a trial state with the right expiration", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "developer-sandbox", "professional", "addable");

  const now = new Date("2026-01-01T00:00:00Z");
  await attachAddOn(repo, ORG_ID, "developer-sandbox", "professional", { trial: true, trialDurationDays: 14, now });

  const result = await computeServiceAvailability(repo, ORG_ID, "developer-sandbox", "professional", now);
  assert.equal(result.state, "trial");
  if (result.state === "trial") {
    assert.equal(result.expiresAt.toISOString(), "2026-01-15T00:00:00.000Z");
    assert.equal(result.daysRemaining, 14);
  }
});

test("an EXPIRED trial is treated as locked, even if the stored status still says trial", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "developer-sandbox", "professional", "addable", "price_x");

  const attachedAt = new Date("2026-01-01T00:00:00Z");
  await attachAddOn(repo, ORG_ID, "developer-sandbox", "professional", { trial: true, trialDurationDays: 14, now: attachedAt });

  const wellAfterExpiry = new Date("2026-02-01T00:00:00Z");
  const result = await computeServiceAvailability(repo, ORG_ID, "developer-sandbox", "professional", wellAfterExpiry);

  assert.equal(result.state, "locked");
  if (result.state === "locked") {
    assert.equal(result.unlockPath.type, "add_on");
  }
});

test("cancelAddOn reverts the service back to locked", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "developer-sandbox", "professional", "addable");
  await attachAddOn(repo, ORG_ID, "developer-sandbox", "professional");

  await cancelAddOn(repo, ORG_ID, "developer-sandbox");
  const result = await computeServiceAvailability(repo, ORG_ID, "developer-sandbox", "professional");
  assert.equal(result.state, "locked");
});

test("cancelAddOn on a service with no selection throws selection_not_found", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await assert.rejects(
    () => cancelAddOn(repo, ORG_ID, "developer-sandbox"),
    (err: unknown) => err instanceof ServiceCatalogError && err.code === "selection_not_found",
  );
});

test("a stale ACTIVE selection from before a tier downgrade correctly reverts to locked, not available", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "developer-sandbox", "enterprise", "included");
  await setTierAvailability(repo, "developer-sandbox", "professional", "addable");

  const atEnterprise = await computeServiceAvailability(repo, ORG_ID, "developer-sandbox", "enterprise");
  assert.deepEqual(atEnterprise, { state: "available", source: "tier_included" });

  const afterDowngrade = await computeServiceAvailability(repo, ORG_ID, "developer-sandbox", "professional");
  assert.equal(afterDowngrade.state, "locked");
});

// ---------------------------------------------------------------------
// State computation: disable overrides trump everything
// ---------------------------------------------------------------------

test("a global disable override wins even when the service is included at this tier", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "core-identity", "foundation", "included");
  await disableService(repo, "core-identity", { reason: "Scheduled maintenance", cause: "maintenance" });

  const result = await computeServiceAvailability(repo, ORG_ID, "core-identity", "foundation");
  assert.equal(result.state, "disabled");
  if (result.state === "disabled") {
    assert.equal(result.cause, "maintenance");
  }
});

test("a disable override wins even when the org has an active paid selection", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "developer-sandbox", "professional", "addable");
  await attachAddOn(repo, ORG_ID, "developer-sandbox", "professional");
  await disableService(repo, "developer-sandbox", { organizationId: ORG_ID, reason: "Policy violation", cause: "policy" });

  const result = await computeServiceAvailability(repo, ORG_ID, "developer-sandbox", "professional");
  assert.equal(result.state, "disabled");
});

test("an org-specific override does not affect a different org", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "core-identity", "foundation", "included");
  await disableService(repo, "core-identity", { organizationId: ORG_ID, reason: "Policy violation", cause: "policy" });

  const otherOrgResult = await computeServiceAvailability(repo, "org-2", "core-identity", "foundation");
  assert.deepEqual(otherOrgResult, { state: "available", source: "tier_included" });
});

test("resolveDisableOverride restores normal state computation afterward", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "core-identity", "foundation", "included");
  const override = await disableService(repo, "core-identity", { reason: "Maintenance", cause: "maintenance" });

  const whileDisabled = await computeServiceAvailability(repo, ORG_ID, "core-identity", "foundation");
  assert.equal(whileDisabled.state, "disabled");

  await resolveDisableOverride(repo, override.id);
  const afterResolved = await computeServiceAvailability(repo, ORG_ID, "core-identity", "foundation");
  assert.deepEqual(afterResolved, { state: "available", source: "tier_included" });
});

test("org-specific override is preferred over a simultaneous global override for the same service", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "core-identity", "foundation", "included");
  await disableService(repo, "core-identity", { reason: "Global maintenance", cause: "maintenance" });
  await disableService(repo, "core-identity", { organizationId: ORG_ID, reason: "This org specifically", cause: "policy" });

  const result = await computeServiceAvailability(repo, ORG_ID, "core-identity", "foundation");
  assert.equal(result.state, "disabled");
  if (result.state === "disabled") {
    assert.equal(result.reason, "This org specifically");
  }
});

// ---------------------------------------------------------------------
// computeCatalogForOrganization
// ---------------------------------------------------------------------

test("computeCatalogForOrganization returns availability for every active service in one call", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "core-identity", "foundation", "included");
  await setTierAvailability(repo, "developer-sandbox", "foundation", "addable");
  await setTierAvailability(repo, "sso", "foundation", "unavailable");
  await setTierAvailability(repo, "sso", "enterprise", "included");

  const catalog = await computeCatalogForOrganization(repo, ORG_ID, "foundation");
  assert.equal(catalog.length, 3);

  const byKey = Object.fromEntries(catalog.map((c) => [c.service.key, c.availability.state]));
  assert.equal(byKey["core-identity"], "available");
  assert.equal(byKey["developer-sandbox"], "locked");
  assert.equal(byKey["sso"], "locked");
});

// ---------------------------------------------------------------------
// Minimum-tier eligibility shortcut
// ---------------------------------------------------------------------

test("a service with minimumPlanCode and no explicit rows is addable for an org at or above that tier", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];
  await createService(repo, {
    key: "developer-platform",
    name: "Developer Platform",
    description: "x",
    category: "developer",
    minimumPlanCode: "professional",
    defaultAddOnStripePriceId: "price_dev_platform",
  });
  // Deliberately no setTierAvailability calls at all.

  const result = await computeServiceAvailability(repo, ORG_ID, "developer-platform", "professional");
  assert.equal(result.state, "locked");
  if (result.state === "locked") {
    assert.deepEqual(result.unlockPath, {
      type: "add_on",
      serviceId: (await repo.getServiceByKey("developer-platform"))!.id,
      addOnStripePriceId: "price_dev_platform",
    });
  }

  // Also eligible one tier above the minimum, not just exactly at it.
  const resultAbove = await computeServiceAvailability(repo, ORG_ID, "developer-platform", "enterprise");
  assert.equal(resultAbove.state, "locked");
  if (resultAbove.state === "locked") {
    assert.equal(resultAbove.unlockPath.type, "add_on");
  }
});

test("a service with minimumPlanCode is locked with upgrade_tier (pointing at the minimum) for an org below that tier", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];
  await createService(repo, {
    key: "air-gapped-deployment",
    name: "Air-Gapped Deployment",
    description: "x",
    category: "infrastructure",
    minimumPlanCode: "enterprise",
  });

  const result = await computeServiceAvailability(repo, ORG_ID, "air-gapped-deployment", "professional");
  assert.equal(result.state, "locked");
  if (result.state === "locked") {
    assert.deepEqual(result.unlockPath, { type: "upgrade_tier", targetPlanCode: "enterprise" });
  }
});

test("attachAddOn succeeds for a minimum-tier-eligible org with no explicit matrix row -- the actual point of the shortcut", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];
  await createService(repo, {
    key: "developer-platform",
    name: "Developer Platform",
    description: "x",
    category: "developer",
    minimumPlanCode: "professional",
    defaultAddOnStripePriceId: "price_dev_platform",
  });

  const selection = await attachAddOn(repo, ORG_ID, "developer-platform", "professional");
  assert.equal(selection.status, "active");

  const result = await computeServiceAvailability(repo, ORG_ID, "developer-platform", "professional");
  assert.deepEqual(result, { state: "available", source: "add_on" });
});

test("attachAddOn refuses a minimum-tier-gated service for an org below the minimum", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];
  await createService(repo, {
    key: "air-gapped-deployment",
    name: "Air-Gapped Deployment",
    description: "x",
    category: "infrastructure",
    minimumPlanCode: "enterprise",
  });

  await assert.rejects(
    () => attachAddOn(repo, ORG_ID, "air-gapped-deployment", "professional"),
    (err: unknown) => err instanceof ServiceCatalogError && err.code === "plan_not_found",
  );
});

test("explicit tier-availability rows completely override minimumPlanCode, not blend with it -- the all-or-nothing rule", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];
  await createService(repo, {
    key: "threat-intel-premium",
    name: "Threat Intelligence Premium",
    description: "x",
    category: "security",
    minimumPlanCode: "enterprise", // would normally require enterprise
  });
  // But an explicit row makes it addable at professional -- the matrix wins.
  await setTierAvailability(repo, "threat-intel-premium", "professional", "addable", "price_threat_intel");

  const result = await computeServiceAvailability(repo, ORG_ID, "threat-intel-premium", "professional");
  assert.equal(result.state, "locked");
  if (result.state === "locked") {
    assert.equal(result.unlockPath.type, "add_on"); // not upgrade_tier, even though minimumPlanCode says enterprise
  }
});

test("explicit rows override minimumPlanCode even for a tier that has NO explicit row of its own", async () => {
  // The all-or-nothing rule is about the SERVICE having any rows at
  // all, not about whether THIS specific tier has one -- foundation has
  // no row here, but professional does, so the matrix (not
  // minimumPlanCode) still governs foundation's "unavailable" result.
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];
  await createService(repo, {
    key: "threat-intel-premium",
    name: "Threat Intelligence Premium",
    description: "x",
    category: "security",
    minimumPlanCode: "professional",
  });
  await setTierAvailability(repo, "threat-intel-premium", "enterprise", "included");
  // No row for foundation or professional.

  const result = await computeServiceAvailability(repo, ORG_ID, "threat-intel-premium", "foundation");
  assert.equal(result.state, "locked");
  if (result.state === "locked" && result.unlockPath.type === "upgrade_tier") {
    // Nearest EXPLICIT row (enterprise), not minimumPlanCode (professional).
    assert.equal(result.unlockPath.targetPlanCode, "enterprise");
  } else {
    assert.fail("expected an upgrade_tier unlock path pointing at the explicit row");
  }
});

test("a service with neither explicit rows nor a minimum tier is locked with no known unlock path, not a crash", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];
  await createService(repo, { key: "unconfigured-service", name: "Unconfigured", description: "x", category: "x" });

  const result = await computeServiceAvailability(repo, ORG_ID, "unconfigured-service", "foundation");
  assert.equal(result.state, "locked");
  if (result.state === "locked" && result.unlockPath.type === "upgrade_tier") {
    assert.equal(result.unlockPath.targetPlanCode, "foundation"); // falls back to the org's own current plan when nothing better is known
  } else {
    assert.fail("expected an upgrade_tier unlock path");
  }
});

// ---------------------------------------------------------------------
// New enforcement flags: isAddOnEligible, supportsTrial
// ---------------------------------------------------------------------

test("attachAddOn refuses a service with isAddOnEligible: false, even if otherwise addable", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];
  await createService(repo, {
    key: "internal-only-service",
    name: "Internal Only",
    description: "x",
    category: "x",
    isAddOnEligible: false,
  });
  await setTierAvailability(repo, "internal-only-service", "foundation", "addable");

  await assert.rejects(() => attachAddOn(repo, ORG_ID, "internal-only-service", "foundation"));
});

test("attachAddOn refuses trial: true for a service with supportsTrial: false", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];
  await createService(repo, {
    key: "no-trial-service",
    name: "No Trial",
    description: "x",
    category: "x",
    supportsTrial: false,
  });
  await setTierAvailability(repo, "no-trial-service", "foundation", "addable");

  await assert.rejects(() => attachAddOn(repo, ORG_ID, "no-trial-service", "foundation", { trial: true }));
  // Non-trial attach for the same service should still succeed.
  const selection = await attachAddOn(repo, ORG_ID, "no-trial-service", "foundation");
  assert.equal(selection.status, "active");
});

// ---------------------------------------------------------------------
// Dependency graph
// ---------------------------------------------------------------------

test("addDependency refuses a service depending on itself", async () => {
  const repo = new FakeServiceCatalogRepository();
  await createService(repo, { key: "sso", name: "SSO", description: "x", category: "identity" });
  await assert.rejects(
    () => addDependency(repo, "sso", "sso"),
    (err: unknown) => err instanceof ServiceCatalogError && err.code === "invalid_key",
  );
});

test("removeDependency actually removes it", async () => {
  const repo = new FakeServiceCatalogRepository();
  await createService(repo, { key: "threat-intel", name: "Threat Intel", description: "x", category: "security" });
  await createService(repo, { key: "aegis-core", name: "Aegis Core", description: "x", category: "identity" });
  await addDependency(repo, "threat-intel", "aegis-core");
  await removeDependency(repo, "threat-intel", "aegis-core");

  const threatIntel = await repo.getServiceByKey("threat-intel");
  const deps = await repo.listDirectDependencies(threatIntel!.id);
  assert.equal(deps.length, 0);
});

// ---------------------------------------------------------------------
// computeFinalEntitlements: the full pipeline
// ---------------------------------------------------------------------

async function setupEntitlementCatalog(repo: FakeServiceCatalogRepository) {
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];

  await createService(repo, { key: "aegis-core", name: "Aegis Core", description: "x", category: "identity", entitlementKey: "core.identity" });
  await createService(repo, {
    key: "threat-intel",
    name: "Threat Intelligence",
    description: "x",
    category: "security",
    entitlementKey: "threat.intelligence",
  });
  await addDependency(repo, "threat-intel", "aegis-core");

  await setTierAvailability(repo, "aegis-core", "professional", "included");
  await setTierAvailability(repo, "threat-intel", "professional", "included");
}

test("computeFinalEntitlements resolves entitlementKeys for tier-included services", async () => {
  const repo = new FakeServiceCatalogRepository();
  const flagsRepo = new FakeFeatureFlagsRepository();
  await setupEntitlementCatalog(repo);

  const entitlements = await computeFinalEntitlements(repo, flagsRepo, ORG_ID, "professional");
  assert.ok(entitlements.has("threat.intelligence"));
  assert.ok(entitlements.has("core.identity"));
});

test("computeFinalEntitlements grants a dependency's entitlement even when the org isn't independently eligible for it", async () => {
  const repo = new FakeServiceCatalogRepository();
  const flagsRepo = new FakeFeatureFlagsRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];

  await createService(repo, { key: "aegis-core", name: "Aegis Core", description: "x", category: "identity", entitlementKey: "core.identity" });
  await createService(repo, {
    key: "developer-platform",
    name: "Developer Platform",
    description: "x",
    category: "developer",
    entitlementKey: "developer.mode",
  });
  await addDependency(repo, "developer-platform", "aegis-core");
  // developer-platform is tier-included here, deliberately NOT attached
  // via attachAddOn -- this test is specifically about
  // computeFinalEntitlements's dependency-closure safety net (a
  // dependency gets granted once its dependent is entitled, regardless
  // of the dependency's own independent eligibility), which is a
  // different mechanism from attachAddOn's own dependency gating
  // (covered separately below). Note: aegis-core has NO tier
  // availability row and NO minimumPlanCode at all -- it would be
  // "unavailable" if checked independently.
  await setTierAvailability(repo, "developer-platform", "professional", "included");

  const entitlements = await computeFinalEntitlements(repo, flagsRepo, ORG_ID, "professional");
  assert.ok(entitlements.has("developer.mode"));
  assert.ok(entitlements.has("core.identity")); // granted purely via dependency
});

test("computeFinalEntitlements is immune to a dependency cycle -- no infinite loop", async () => {
  const repo = new FakeServiceCatalogRepository();
  const flagsRepo = new FakeFeatureFlagsRepository();
  repo.planCodesByPriceAscending = ["foundation"];

  await createService(repo, { key: "service-a", name: "A", description: "x", category: "x", entitlementKey: "a" });
  await createService(repo, { key: "service-b", name: "B", description: "x", category: "x", entitlementKey: "b" });
  await addDependency(repo, "service-a", "service-b");
  await addDependency(repo, "service-b", "service-a"); // cycle
  await setTierAvailability(repo, "service-a", "foundation", "included");

  const entitlements = await computeFinalEntitlements(repo, flagsRepo, ORG_ID, "foundation");
  assert.ok(entitlements.has("a"));
  assert.ok(entitlements.has("b"));
});

test("computeFinalEntitlements excludes a service with no entitlementKey -- catalog/display-only", async () => {
  const repo = new FakeServiceCatalogRepository();
  const flagsRepo = new FakeFeatureFlagsRepository();
  repo.planCodesByPriceAscending = ["foundation"];
  await createService(repo, { key: "display-only", name: "Display Only", description: "x", category: "x" }); // no entitlementKey
  await setTierAvailability(repo, "display-only", "foundation", "included");

  const entitlements = await computeFinalEntitlements(repo, flagsRepo, ORG_ID, "foundation");
  assert.equal(entitlements.size, 0);
});

test("computeFinalEntitlements suppresses a service whose feature flag is off", async () => {
  const repo = new FakeServiceCatalogRepository();
  const flagsRepo = new FakeFeatureFlagsRepository();
  repo.planCodesByPriceAscending = ["foundation"];
  await createService(repo, {
    key: "gated-service",
    name: "Gated",
    description: "x",
    category: "x",
    entitlementKey: "gated.feature",
    featureFlagKey: "gated-service-rollout",
  });
  await setTierAvailability(repo, "gated-service", "foundation", "included");
  await createFlag(flagsRepo, { key: "gated-service-rollout", description: "x" }); // defaults to disabled

  const entitlements = await computeFinalEntitlements(repo, flagsRepo, ORG_ID, "foundation");
  assert.equal(entitlements.has("gated.feature"), false);
});

test("computeFinalEntitlements grants a feature-flag-gated service once the flag is enabled", async () => {
  const repo = new FakeServiceCatalogRepository();
  const flagsRepo = new FakeFeatureFlagsRepository();
  repo.planCodesByPriceAscending = ["foundation"];
  await createService(repo, {
    key: "gated-service",
    name: "Gated",
    description: "x",
    category: "x",
    entitlementKey: "gated.feature",
    featureFlagKey: "gated-service-rollout",
  });
  await setTierAvailability(repo, "gated-service", "foundation", "included");
  await createFlag(flagsRepo, { key: "gated-service-rollout", description: "x" });
  await setFlagEnabled(flagsRepo, "gated-service-rollout", true);

  const entitlements = await computeFinalEntitlements(repo, flagsRepo, ORG_ID, "foundation");
  assert.ok(entitlements.has("gated.feature"));
});

test("computeFinalEntitlements excludes a disabled service's entitlement even though the org is otherwise entitled", async () => {
  const repo = new FakeServiceCatalogRepository();
  const flagsRepo = new FakeFeatureFlagsRepository();
  repo.planCodesByPriceAscending = ["foundation"];
  await createService(repo, { key: "maintenance-service", name: "M", description: "x", category: "x", entitlementKey: "m.feature" });
  await setTierAvailability(repo, "maintenance-service", "foundation", "included");
  await disableService(repo, "maintenance-service", { reason: "Maintenance", cause: "maintenance" });

  const entitlements = await computeFinalEntitlements(repo, flagsRepo, ORG_ID, "foundation");
  assert.equal(entitlements.has("m.feature"), false);
});

test("the worked example: Professional + Developer Platform + Voice AI + Extra Storage produces the expected entitlement set", async () => {
  const repo = new FakeServiceCatalogRepository();
  const flagsRepo = new FakeFeatureFlagsRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];

  // Professional's included services.
  await createService(repo, { key: "ai-chat", name: "AI Chat", description: "x", category: "ai", entitlementKey: "ai.chat" });
  await createService(repo, { key: "compliance", name: "Compliance", description: "x", category: "compliance", entitlementKey: "compliance.basic" });
  await createService(repo, { key: "threat-intel", name: "Threat Intelligence", description: "x", category: "security", entitlementKey: "threat.intelligence" });
  for (const key of ["ai-chat", "compliance", "threat-intel"]) {
    await setTierAvailability(repo, key, "professional", "included");
  }

  // Add-ons the org purchased.
  await createService(repo, {
    key: "developer-platform",
    name: "Developer Platform",
    description: "x",
    category: "developer",
    entitlementKey: "developer.mode",
    minimumPlanCode: "professional",
  });
  await createService(repo, { key: "voice-ai", name: "Voice AI", description: "x", category: "ai", entitlementKey: "voice" });
  await setTierAvailability(repo, "voice-ai", "professional", "addable", "price_voice");
  await createService(repo, { key: "extra-storage", name: "Extra Storage", description: "x", category: "infrastructure", entitlementKey: "storage.500gb" });
  await setTierAvailability(repo, "extra-storage", "professional", "addable", "price_storage");

  await attachAddOn(repo, ORG_ID, "developer-platform", "professional");
  await attachAddOn(repo, ORG_ID, "voice-ai", "professional");
  await attachAddOn(repo, ORG_ID, "extra-storage", "professional");

  const entitlements = await computeFinalEntitlements(repo, flagsRepo, ORG_ID, "professional");

  assert.deepEqual(
    [...entitlements].sort(),
    ["ai.chat", "compliance.basic", "developer.mode", "storage.500gb", "threat.intelligence", "voice"].sort(),
  );
});

// ---------------------------------------------------------------------
// Solution Bundles
// ---------------------------------------------------------------------

test("createBundle rejects an invalid key format", async () => {
  const repo = new FakeServiceCatalogRepository();
  await assert.rejects(
    () => createBundle(repo, { key: "Agriculture Bundle!", name: "x", description: "x", category: "agriculture" }),
    (err: unknown) => err instanceof ServiceCatalogError && err.code === "invalid_key",
  );
});

test("createBundle rejects a duplicate key", async () => {
  const repo = new FakeServiceCatalogRepository();
  await createBundle(repo, { key: "agriculture-bundle", name: "Agriculture", description: "x", category: "agriculture" });
  await assert.rejects(
    () => createBundle(repo, { key: "agriculture-bundle", name: "Ag again", description: "x", category: "agriculture" }),
    (err: unknown) => err instanceof ServiceCatalogError && err.code === "duplicate_key",
  );
});

async function setupAgricultureBundle(repo: FakeServiceCatalogRepository) {
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];

  await createBundle(repo, {
    key: "agriculture-bundle",
    name: "Agriculture Bundle",
    description: "x",
    category: "agriculture",
    monthlyPriceCents: 15000,
  });

  await createService(repo, { key: "ag-compliance", name: "Compliance (Agriculture)", description: "x", category: "compliance", entitlementKey: "compliance.agriculture" });
  await createService(repo, { key: "weather-integrations", name: "Weather Integrations", description: "x", category: "integrations", entitlementKey: "integrations.weather" });
  await createService(repo, { key: "edge-device-management", name: "Edge Device Management", description: "x", category: "infrastructure", entitlementKey: "infra.edge_devices" });
  await createService(repo, { key: "ai-agronomy-assistant", name: "AI Agronomy Assistant", description: "x", category: "ai", entitlementKey: "ai.agronomy" });
  await createService(repo, { key: "sensor-analytics", name: "Sensor Analytics", description: "x", category: "analytics", entitlementKey: "analytics.sensor" });

  for (const key of ["ag-compliance", "weather-integrations", "edge-device-management", "ai-agronomy-assistant", "sensor-analytics"]) {
    await addServiceToBundle(repo, "agriculture-bundle", key);
  }
}

test("attachBundle refuses a bundle when the org's tier is below the bundle's minimumPlanCode", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];
  await createBundle(repo, { key: "enterprise-only-bundle", name: "x", description: "x", category: "x", minimumPlanCode: "enterprise" });

  await assert.rejects(
    () => attachBundle(repo, ORG_ID, "enterprise-only-bundle", "professional"),
    (err: unknown) => err instanceof ServiceCatalogError && err.code === "plan_not_found",
  );
});

test("attachBundle refuses trial: true for a bundle with supportsTrial: false", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation"];
  await createBundle(repo, { key: "no-trial-bundle", name: "x", description: "x", category: "x", supportsTrial: false });

  await assert.rejects(() => attachBundle(repo, ORG_ID, "no-trial-bundle", "foundation", { trial: true }));
});

test("after attachBundle, EVERY member service becomes available in computeServiceAvailability -- the actual point of a bundle", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupAgricultureBundle(repo);
  // Deliberately no tier-availability rows for any of the bundle's
  // services -- they'd all be "locked" without the bundle.

  await attachBundle(repo, ORG_ID, "agriculture-bundle", "professional");

  for (const key of ["ag-compliance", "weather-integrations", "edge-device-management", "ai-agronomy-assistant", "sensor-analytics"]) {
    const result = await computeServiceAvailability(repo, ORG_ID, key, "professional");
    assert.deepEqual(result, { state: "available", source: "bundle" }, `expected ${key} to be available via the bundle`);
  }
});

test("a trial bundle selection produces a trial state for member services, with the bundle's own expiration", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupAgricultureBundle(repo);

  const now = new Date("2026-01-01T00:00:00Z");
  await attachBundle(repo, ORG_ID, "agriculture-bundle", "professional", { trial: true, trialDurationDays: 14, now });

  const result = await computeServiceAvailability(repo, ORG_ID, "weather-integrations", "professional", now);
  assert.equal(result.state, "trial");
  if (result.state === "trial") {
    assert.equal(result.expiresAt.toISOString(), "2026-01-15T00:00:00.000Z");
    assert.equal(result.daysRemaining, 14);
  }
});

test("a disable override on a bundle-member service still wins over bundle membership", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupAgricultureBundle(repo);
  await attachBundle(repo, ORG_ID, "agriculture-bundle", "professional");
  await disableService(repo, "weather-integrations", { reason: "Provider outage", cause: "admin_action" });

  const result = await computeServiceAvailability(repo, ORG_ID, "weather-integrations", "professional");
  assert.equal(result.state, "disabled");
});

test("cancelBundle reverts member services back to locked", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupAgricultureBundle(repo);
  await attachBundle(repo, ORG_ID, "agriculture-bundle", "professional");
  await cancelBundle(repo, ORG_ID, "agriculture-bundle");

  const result = await computeServiceAvailability(repo, ORG_ID, "weather-integrations", "professional");
  assert.equal(result.state, "locked");
});

test("removeServiceFromBundle actually removes membership", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupAgricultureBundle(repo);
  await removeServiceFromBundle(repo, "agriculture-bundle", "weather-integrations");
  await attachBundle(repo, ORG_ID, "agriculture-bundle", "professional");

  const result = await computeServiceAvailability(repo, ORG_ID, "weather-integrations", "professional");
  assert.equal(result.state, "locked"); // no longer a member, no longer granted
});

test("computeFinalEntitlements includes every bundle member's entitlementKey", async () => {
  const repo = new FakeServiceCatalogRepository();
  const flagsRepo = new FakeFeatureFlagsRepository();
  await setupAgricultureBundle(repo);
  await attachBundle(repo, ORG_ID, "agriculture-bundle", "professional");

  const entitlements = await computeFinalEntitlements(repo, flagsRepo, ORG_ID, "professional");
  assert.deepEqual(
    [...entitlements].sort(),
    ["ai.agronomy", "analytics.sensor", "compliance.agriculture", "infra.edge_devices", "integrations.weather"].sort(),
  );
});

test("the full worked example: Professional tier + Agriculture bundle + individual add-ons, all together", async () => {
  const repo = new FakeServiceCatalogRepository();
  const flagsRepo = new FakeFeatureFlagsRepository();
  await setupAgricultureBundle(repo);

  // Tier-included service.
  await createService(repo, { key: "ai-chat", name: "AI Chat", description: "x", category: "ai", entitlementKey: "ai.chat" });
  await setTierAvailability(repo, "ai-chat", "professional", "included");

  // Individual add-ons purchased alongside the bundle.
  await createService(repo, { key: "voice-ai", name: "Voice AI", description: "x", category: "ai", entitlementKey: "voice" });
  await setTierAvailability(repo, "voice-ai", "professional", "addable", "price_voice");
  await createService(repo, { key: "extra-storage", name: "Extra Storage", description: "x", category: "infrastructure", entitlementKey: "storage.500gb" });
  await setTierAvailability(repo, "extra-storage", "professional", "addable", "price_storage");

  await attachBundle(repo, ORG_ID, "agriculture-bundle", "professional");
  await attachAddOn(repo, ORG_ID, "voice-ai", "professional");
  await attachAddOn(repo, ORG_ID, "extra-storage", "professional");

  const entitlements = await computeFinalEntitlements(repo, flagsRepo, ORG_ID, "professional");
  assert.deepEqual(
    [...entitlements].sort(),
    [
      "ai.chat",
      "voice",
      "storage.500gb",
      "compliance.agriculture",
      "integrations.weather",
      "infra.edge_devices",
      "ai.agronomy",
      "analytics.sensor",
    ].sort(),
  );

  // And every one of them shows correctly in the catalog view too, not just the entitlement set.
  const catalog = await computeCatalogForOrganization(repo, ORG_ID, "professional");
  const availabilityByKey = Object.fromEntries(catalog.map((c) => [c.service.key, c.availability.state]));
  assert.equal(availabilityByKey["weather-integrations"], "available");
  assert.equal(availabilityByKey["voice-ai"], "available");
});

// ---------------------------------------------------------------------
// Tier progression
// ---------------------------------------------------------------------

test("computeTierProgression throws plan_not_found for an unknown current plan code", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];
  await assert.rejects(
    () => computeTierProgression(repo, ORG_ID, "not-a-real-plan"),
    (err: unknown) => err instanceof ServiceCatalogError && err.code === "plan_not_found",
  );
});

test("computeTierProgression excludes an already-available service", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];
  await createService(repo, { key: "ai-chat", name: "AI Chat", description: "x", category: "ai" });
  await setTierAvailability(repo, "ai-chat", "professional", "included");

  const progression = await computeTierProgression(repo, ORG_ID, "professional");
  const allUnlocked = progression.flatMap((entry) => entry.unlocksServices.map((s) => s.key));
  assert.ok(!allUnlocked.includes("ai-chat"));
});

test("computeTierProgression excludes a service that's addable NOW -- upgrading isn't required for it", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];
  await createService(repo, { key: "voice-ai", name: "Voice AI", description: "x", category: "ai" });
  await setTierAvailability(repo, "voice-ai", "professional", "addable");

  const progression = await computeTierProgression(repo, ORG_ID, "professional");
  const allUnlocked = progression.flatMap((entry) => entry.unlocksServices.map((s) => s.key));
  assert.ok(!allUnlocked.includes("voice-ai"));
});

test("computeTierProgression excludes a disabled service -- don't tease something not actually working", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];
  await createService(repo, { key: "threat-intel", name: "Threat Intel", description: "x", category: "security" });
  await setTierAvailability(repo, "threat-intel", "enterprise", "included");
  await disableService(repo, "threat-intel", { reason: "Maintenance", cause: "maintenance" });

  const progression = await computeTierProgression(repo, ORG_ID, "professional");
  const allUnlocked = progression.flatMap((entry) => entry.unlocksServices.map((s) => s.key));
  assert.ok(!allUnlocked.includes("threat-intel"));
});

test("computeTierProgression groups multiple services under the same tier together", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];
  await createService(repo, { key: "threat-intel", name: "Threat Intel", description: "x", category: "security" });
  await createService(repo, { key: "risk-intel", name: "Risk Intel", description: "x", category: "security" });
  await setTierAvailability(repo, "threat-intel", "enterprise", "included");
  await setTierAvailability(repo, "risk-intel", "enterprise", "included");

  const progression = await computeTierProgression(repo, ORG_ID, "professional");
  const enterpriseEntry = progression.find((e) => e.planCode === "enterprise");
  assert.ok(enterpriseEntry);
  assert.deepEqual(
    enterpriseEntry!.unlocksServices.map((s) => s.key).sort(),
    ["risk-intel", "threat-intel"],
  );
});

test("computeTierProgression returns an empty list for an org already at the top tier", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];
  await createService(repo, { key: "sso", name: "SSO", description: "x", category: "identity" });
  await setTierAvailability(repo, "sso", "foundation", "unavailable");

  const progression = await computeTierProgression(repo, ORG_ID, "enterprise");
  assert.deepEqual(progression, []);
});

test("the worked example: Professional org sees Business and Enterprise unlock lists exactly as sketched", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "business", "enterprise"];

  // Currently available at Professional (should never appear in progression).
  for (const key of ["ai-chat", "compliance", "automation", "analytics"]) {
    await createService(repo, { key, name: key, description: "x", category: "x" });
    await setTierAvailability(repo, key, "professional", "included");
  }

  // Unlocked at Business.
  for (const key of ["threat-intelligence", "risk-intelligence", "premium-automation", "compliance-packs"]) {
    await createService(repo, { key, name: key, description: "x", category: "x" });
    await setTierAvailability(repo, key, "business", "included");
  }

  // Unlocked at Enterprise.
  for (const key of ["air-gapped-deployment", "dedicated-ai-cluster", "sso", "white-label", "custom-ai-models"]) {
    await createService(repo, { key, name: key, description: "x", category: "x" });
    await setTierAvailability(repo, key, "enterprise", "included");
  }

  const progression = await computeTierProgression(repo, ORG_ID, "professional");

  assert.equal(progression.length, 2);
  const businessEntry = progression.find((e) => e.planCode === "business")!;
  const enterpriseEntry = progression.find((e) => e.planCode === "enterprise")!;

  assert.deepEqual(
    businessEntry.unlocksServices.map((s) => s.key).sort(),
    ["compliance-packs", "premium-automation", "risk-intelligence", "threat-intelligence"].sort(),
  );
  assert.deepEqual(
    enterpriseEntry.unlocksServices.map((s) => s.key).sort(),
    ["air-gapped-deployment", "custom-ai-models", "dedicated-ai-cluster", "sso", "white-label"].sort(),
  );

  // Business entry comes before Enterprise, ascending by tier.
  assert.equal(progression[0]!.planCode, "business");
  assert.equal(progression[1]!.planCode, "enterprise");
});

// ---------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------

test("createCategory rejects an invalid key format", async () => {
  const repo = new FakeServiceCatalogRepository();
  await assert.rejects(
    () => createCategory(repo, { key: "Artificial Intelligence!", name: "AI", displayOrder: 1 }),
    (err: unknown) => err instanceof ServiceCatalogError && err.code === "invalid_key",
  );
});

test("createCategory rejects a duplicate key", async () => {
  const repo = new FakeServiceCatalogRepository();
  await createCategory(repo, { key: "ai", name: "AI", displayOrder: 1 });
  await assert.rejects(
    () => createCategory(repo, { key: "ai", name: "AI again", displayOrder: 2 }),
    (err: unknown) => err instanceof ServiceCatalogError && err.code === "duplicate_key",
  );
});

test("listCategories returns categories ordered by displayOrder, not creation order or alphabetically", async () => {
  const repo = new FakeServiceCatalogRepository();
  await createCategory(repo, { key: "security", name: "Security", displayOrder: 3 });
  await createCategory(repo, { key: "ai", name: "AI", displayOrder: 1 });
  await createCategory(repo, { key: "compliance", name: "Compliance", displayOrder: 2 });

  const categories = await listCategories(repo);
  assert.deepEqual(
    categories.map((c) => c.key),
    ["ai", "compliance", "security"],
  );
});

test("computeCategorizedCatalogForOrganization groups services by category in displayOrder", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];

  await createCategory(repo, { key: "ai", name: "AI", displayOrder: 1 });
  await createCategory(repo, { key: "compliance", name: "Compliance", displayOrder: 2 });
  await createCategory(repo, { key: "security", name: "Security", displayOrder: 3 });

  await createService(repo, { key: "chat", name: "Chat", description: "x", category: "ai" });
  await setTierAvailability(repo, "chat", "professional", "included");
  await createService(repo, { key: "agents", name: "Agents", description: "x", category: "ai" });
  await setTierAvailability(repo, "agents", "professional", "included");
  await createService(repo, { key: "voice", name: "Voice", description: "x", category: "ai" });
  await setTierAvailability(repo, "voice", "professional", "unavailable");
  await setTierAvailability(repo, "voice", "enterprise", "included");

  await createService(repo, { key: "regulations", name: "Regulations", description: "x", category: "compliance" });
  await setTierAvailability(repo, "regulations", "professional", "included");

  await createService(repo, { key: "threat-feed", name: "Threat Feed", description: "x", category: "security" });
  await setTierAvailability(repo, "threat-feed", "professional", "included");

  const grouped = await computeCategorizedCatalogForOrganization(repo, ORG_ID, "professional");

  assert.equal(grouped.length, 3);
  assert.equal(grouped[0]!.category!.key, "ai");
  assert.equal(grouped[1]!.category!.key, "compliance");
  assert.equal(grouped[2]!.category!.key, "security");

  const aiStates = Object.fromEntries(grouped[0]!.entries.map((e) => [e.service.key, e.availability.state]));
  assert.equal(aiStates["chat"], "available");
  assert.equal(aiStates["agents"], "available");
  assert.equal(aiStates["voice"], "locked");
});

test("a category with zero matching services is simply omitted, not rendered empty", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation"];
  await createCategory(repo, { key: "ai", name: "AI", displayOrder: 1 });
  await createCategory(repo, { key: "developer", name: "Developer", displayOrder: 2 }); // no services at all

  await createService(repo, { key: "chat", name: "Chat", description: "x", category: "ai" });
  await setTierAvailability(repo, "chat", "foundation", "included");

  const grouped = await computeCategorizedCatalogForOrganization(repo, ORG_ID, "foundation");
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0]!.category!.key, "ai");
});

test("a service whose category doesn't match any real category falls into an Uncategorized group at the end, not dropped or errored", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation"];
  await createCategory(repo, { key: "ai", name: "AI", displayOrder: 1 });

  await createService(repo, { key: "chat", name: "Chat", description: "x", category: "ai" });
  await setTierAvailability(repo, "chat", "foundation", "included");
  // "legacy-thing" was never given a real category -- a realistic
  // scenario for data that predates categories being introduced.
  await createService(repo, { key: "legacy-thing", name: "Legacy Thing", description: "x", category: "legacy-thing-category" });
  await setTierAvailability(repo, "legacy-thing", "foundation", "included");

  const grouped = await computeCategorizedCatalogForOrganization(repo, ORG_ID, "foundation");
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0]!.category!.key, "ai");
  assert.equal(grouped[1]!.category, null);
  assert.equal(grouped[1]!.entries[0]!.service.key, "legacy-thing");
});

test("an inactive category is excluded from the grouped view -- its services fall into Uncategorized rather than vanishing", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation"];
  const retired = await createCategory(repo, { key: "retired-category", name: "Retired", displayOrder: 1 });
  await repo.createCategory({ ...retired, isActive: false });

  await createService(repo, { key: "old-service", name: "Old Service", description: "x", category: "retired-category" });
  await setTierAvailability(repo, "old-service", "foundation", "included");

  const grouped = await computeCategorizedCatalogForOrganization(repo, ORG_ID, "foundation");
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0]!.category, null); // the retired category no longer counts as a real match
});

test("the worked example: AI / Compliance / Security groups render exactly as sketched, with correct per-service state icons", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];

  await createCategory(repo, { key: "ai", name: "AI", displayOrder: 1 });
  await createCategory(repo, { key: "compliance", name: "Compliance", displayOrder: 2 });
  await createCategory(repo, { key: "security", name: "Security", displayOrder: 3 });

  const seed: Array<[string, string, string, "included" | "unavailable" | "addable"]> = [
    ["chat", "ai", "professional", "included"],
    ["agents", "ai", "professional", "included"],
    ["voice", "ai", "professional", "unavailable"],
    ["vision", "ai", "professional", "unavailable"],
    ["regulations", "compliance", "professional", "included"],
    ["ai-reports", "compliance", "professional", "unavailable"],
    ["threat-feed", "security", "professional", "included"],
    ["premium-feed", "security", "professional", "unavailable"],
    ["risk-intelligence", "security", "professional", "unavailable"],
  ];
  for (const [key, category, planCode, type] of seed) {
    await createService(repo, { key, name: key, description: "x", category });
    await setTierAvailability(repo, key, planCode, type);
    if (type === "unavailable") {
      await setTierAvailability(repo, key, "enterprise", "included"); // so it has a real upgrade target, not a dead end
    }
  }

  const grouped = await computeCategorizedCatalogForOrganization(repo, ORG_ID, "professional");
  const summary = grouped.map((g) => ({
    category: g.category!.key,
    services: g.entries.map((e) => `${e.availability.state === "available" ? "✓" : "🔒"} ${e.service.key}`),
  }));

  assert.deepEqual(summary, [
    { category: "ai", services: ["✓ chat", "✓ agents", "🔒 voice", "🔒 vision"] },
    { category: "compliance", services: ["✓ regulations", "🔒 ai-reports"] },
    { category: "security", services: ["✓ threat-feed", "🔒 premium-feed", "🔒 risk-intelligence"] },
  ]);
});

// ---------------------------------------------------------------------
// Dependencies as a first-class, reasoned-about concept
// ---------------------------------------------------------------------

async function setupDeveloperSandbox(repo: FakeServiceCatalogRepository) {
  repo.planCodesByPriceAscending = ["foundation", "professional", "business", "enterprise"];
  await createService(repo, { key: "aegis-core", name: "Aegis Core", description: "x", category: "identity" });
  await createService(repo, { key: "ai-platform", name: "AI Platform", description: "x", category: "ai" });
  await createService(repo, { key: "organizations", name: "Organizations", description: "x", category: "identity" });
  await createService(repo, { key: "developer-sandbox", name: "Developer Sandbox", description: "x", category: "developer" });
  await setTierAvailability(repo, "developer-sandbox", "professional", "addable");
  await addDependency(repo, "developer-sandbox", "aegis-core");
  await addDependency(repo, "developer-sandbox", "ai-platform");
  await addDependency(repo, "developer-sandbox", "organizations");
}

test('"This add-on is available": resolveDependencyRequirements returns already_satisfied when every dependency is already covered by the tier', async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupDeveloperSandbox(repo);
  for (const key of ["aegis-core", "ai-platform", "organizations"]) {
    await setTierAvailability(repo, key, "professional", "included");
  }

  const requirements = await resolveDependencyRequirements(repo, ORG_ID, "developer-sandbox", "professional");
  assert.equal(requirements.length, 3);
  assert.ok(requirements.every((r) => r.status === "already_satisfied"));

  const selection = await attachAddOn(repo, ORG_ID, "developer-sandbox", "professional");
  assert.equal(selection.status, "active");
});

test('"It requires Analytics, which you don\'t currently have": a dependency needing a tier upgrade blocks the attach with a clear, structured reason', async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupDeveloperSandbox(repo);
  await setTierAvailability(repo, "aegis-core", "professional", "included");
  await setTierAvailability(repo, "organizations", "professional", "included");
  await setTierAvailability(repo, "ai-platform", "business", "included");

  const requirements = await resolveDependencyRequirements(repo, ORG_ID, "developer-sandbox", "professional");
  const aiPlatform = requirements.find((r) => r.service.key === "ai-platform")!;
  assert.equal(aiPlatform.status, "requires_upgrade");
  assert.equal(aiPlatform.requiresPlanCode, "business");

  await assert.rejects(
    () => attachAddOn(repo, ORG_ID, "developer-sandbox", "professional"),
    (err: unknown) =>
      err instanceof ServiceCatalogError &&
      err.code === "dependency_not_satisfied" &&
      err.unsatisfiedDependencies?.some((r) => r.service.key === "ai-platform" && r.status === "requires_upgrade"),
  );
});

test('"Adding this service will also require these prerequisites": addable-but-unattached dependencies block by default, requiring explicit opt-in', async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupDeveloperSandbox(repo);
  await setTierAvailability(repo, "aegis-core", "professional", "included");
  await setTierAvailability(repo, "organizations", "professional", "included");
  await setTierAvailability(repo, "ai-platform", "professional", "addable");

  const requirements = await resolveDependencyRequirements(repo, ORG_ID, "developer-sandbox", "professional");
  const aiPlatform = requirements.find((r) => r.service.key === "ai-platform")!;
  assert.equal(aiPlatform.status, "can_auto_attach");

  await assert.rejects(
    () => attachAddOn(repo, ORG_ID, "developer-sandbox", "professional"),
    (err: unknown) => err instanceof ServiceCatalogError && err.code === "dependency_not_satisfied",
  );

  const selection = await attachAddOn(repo, ORG_ID, "developer-sandbox", "professional", { autoResolveDependencies: true });
  assert.equal(selection.status, "active");

  const aiPlatformResult = await computeServiceAvailability(repo, ORG_ID, "ai-platform", "professional");
  assert.deepEqual(aiPlatformResult, { state: "available", source: "add_on" });
});

test("auto-resolution is transitive: a dependency-of-a-dependency gets attached too, not just the first level", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional"];
  await createService(repo, { key: "top", name: "Top", description: "x", category: "x" });
  await createService(repo, { key: "middle", name: "Middle", description: "x", category: "x" });
  await createService(repo, { key: "bottom", name: "Bottom", description: "x", category: "x" });
  await setTierAvailability(repo, "top", "professional", "addable");
  await setTierAvailability(repo, "middle", "professional", "addable");
  await setTierAvailability(repo, "bottom", "professional", "addable");
  await addDependency(repo, "top", "middle");
  await addDependency(repo, "middle", "bottom");

  await attachAddOn(repo, ORG_ID, "top", "professional", { autoResolveDependencies: true });

  const middleResult = await computeServiceAvailability(repo, ORG_ID, "middle", "professional");
  const bottomResult = await computeServiceAvailability(repo, ORG_ID, "bottom", "professional");
  assert.deepEqual(middleResult, { state: "available", source: "add_on" });
  assert.deepEqual(bottomResult, { state: "available", source: "add_on" });
});

test("resolveDependencyRequirements is immune to a dependency cycle -- no infinite loop", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation"];
  await createService(repo, { key: "service-a", name: "A", description: "x", category: "x" });
  await createService(repo, { key: "service-b", name: "B", description: "x", category: "x" });
  await setTierAvailability(repo, "service-a", "foundation", "addable");
  await setTierAvailability(repo, "service-b", "foundation", "included");
  await addDependency(repo, "service-a", "service-b");
  await addDependency(repo, "service-b", "service-a");

  const requirements = await resolveDependencyRequirements(repo, ORG_ID, "service-a", "foundation");
  assert.equal(requirements.length, 1);
  assert.equal(requirements[0]!.service.key, "service-b");
});

test("a disabled dependency blocks the attach, distinct from a requires_upgrade dependency", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation"];
  await createService(repo, { key: "dep", name: "Dep", description: "x", category: "x" });
  await createService(repo, { key: "main", name: "Main", description: "x", category: "x" });
  await setTierAvailability(repo, "dep", "foundation", "included");
  await setTierAvailability(repo, "main", "foundation", "addable");
  await addDependency(repo, "main", "dep");
  await disableService(repo, "dep", { reason: "Maintenance", cause: "maintenance" });

  const requirements = await resolveDependencyRequirements(repo, ORG_ID, "main", "foundation");
  assert.equal(requirements[0]!.status, "disabled");

  await assert.rejects(
    () => attachAddOn(repo, ORG_ID, "main", "foundation", { autoResolveDependencies: true }),
    (err: unknown) => err instanceof ServiceCatalogError && err.code === "dependency_not_satisfied",
  );
});

// ---------------------------------------------------------------------
// Navigation: "give me my catalog" -- the frontend never hardcodes nav
// ---------------------------------------------------------------------

test("computeNavigationForOrganization excludes categories with no navigationPath", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation"];
  await createCategory(repo, { key: "ai", name: "AI", displayOrder: 1 });
  await createService(repo, { key: "chat", name: "Chat", description: "x", category: "ai" });
  await setTierAvailability(repo, "chat", "foundation", "included");

  const nav = await computeNavigationForOrganization(repo, ORG_ID, "foundation");
  assert.equal(nav.length, 0);
});

test('the worked example: "some enabled, some locked, some trial" -- three nav items, three different rollup states', async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation", "professional", "enterprise"];

  await createCategory(repo, {
    key: "compliance",
    name: "Compliance",
    displayOrder: 1,
    navigationPath: "/compliance",
    icon: "Shield",
    color: "emerald",
    requiredPermission: "compliance.read",
  });
  await createCategory(repo, { key: "threat-intel", name: "Threat Intelligence", displayOrder: 2, navigationPath: "/threat-intelligence", icon: "Radar", color: "red" });
  await createCategory(repo, { key: "automation", name: "Automation", displayOrder: 3, navigationPath: "/automation", icon: "Bolt", color: "amber" });

  await createService(repo, { key: "regulations", name: "Regulations", description: "x", category: "compliance" });
  await setTierAvailability(repo, "regulations", "professional", "included");

  await createService(repo, { key: "threat-feed", name: "Threat Feed", description: "x", category: "threat-intel" });
  await setTierAvailability(repo, "threat-feed", "enterprise", "included");

  await createService(repo, { key: "workflows", name: "Workflows", description: "x", category: "automation" });
  await setTierAvailability(repo, "workflows", "professional", "addable");
  await attachAddOn(repo, ORG_ID, "workflows", "professional", { trial: true });

  const nav = await computeNavigationForOrganization(repo, ORG_ID, "professional");

  assert.deepEqual(
    nav.map((n) => ({ key: n.key, path: n.path, icon: n.icon, color: n.color, state: n.state })),
    [
      { key: "compliance", path: "/compliance", icon: "Shield", color: "emerald", state: "enabled" },
      { key: "threat-intel", path: "/threat-intelligence", icon: "Radar", color: "red", state: "locked" },
      { key: "automation", path: "/automation", icon: "Bolt", color: "amber", state: "trial" },
    ],
  );
  assert.equal(nav[0]!.requiredPermission, "compliance.read");
});

test("a nav category with zero matching services is omitted entirely, not shown as locked", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation"];
  await createCategory(repo, { key: "developer", name: "Developer", displayOrder: 1, navigationPath: "/developer" });

  const nav = await computeNavigationForOrganization(repo, ORG_ID, "foundation");
  assert.equal(nav.length, 0);
});

test("trial outranks enabled in the rollup -- a category with both a trial and an available service shows as trial", async () => {
  const repo = new FakeServiceCatalogRepository();
  repo.planCodesByPriceAscending = ["foundation"];
  await createCategory(repo, { key: "ai", name: "AI", displayOrder: 1, navigationPath: "/ai" });

  await createService(repo, { key: "chat", name: "Chat", description: "x", category: "ai" });
  await setTierAvailability(repo, "chat", "foundation", "included");

  await createService(repo, { key: "voice", name: "Voice", description: "x", category: "ai" });
  await setTierAvailability(repo, "voice", "foundation", "addable");
  await attachAddOn(repo, ORG_ID, "voice", "foundation", { trial: true });

  const nav = await computeNavigationForOrganization(repo, ORG_ID, "foundation");
  assert.equal(nav[0]!.state, "trial");
});

test("createService accepts and persists the UI declaration fields", async () => {
  const repo = new FakeServiceCatalogRepository();
  const service = await createService(repo, {
    key: "chat",
    name: "Chat",
    description: "x",
    category: "ai",
    icon: "MessageSquare",
    color: "blue",
    navigationPath: "/ai/chat",
    requiredPermission: "ai.chat.read",
  });
  assert.equal(service.icon, "MessageSquare");
  assert.equal(service.color, "blue");
  assert.equal(service.navigationPath, "/ai/chat");
  assert.equal(service.requiredPermission, "ai.chat.read");
});

test("editService updates only the provided fields, leaving everything else exactly as it was", async () => {
  const repo = new FakeServiceCatalogRepository();
  const service = await createService(repo, {
    key: "chat",
    name: "Chat",
    description: "Original description",
    category: "ai",
    icon: "MessageSquare",
  });

  const edited = await editService(repo, service.key, { name: "AI Chat" });

  assert.equal(edited.name, "AI Chat");
  assert.equal(edited.description, "Original description");
  assert.equal(edited.category, "ai");
  assert.equal(edited.icon, "MessageSquare");
});

test("editService does not allow changing the key -- it isn't part of EditServiceInput at all", async () => {
  const repo = new FakeServiceCatalogRepository();
  const service = await createService(repo, { key: "chat", name: "Chat", description: "x", category: "ai" });

  const edited = await editService(repo, service.key, { name: "AI Chat" });
  assert.equal(edited.key, "chat");
});

test("editService distinguishes an omitted nullable field (keeps existing value) from an explicitly cleared one (null)", async () => {
  const repo = new FakeServiceCatalogRepository();
  const service = await createService(repo, {
    key: "chat",
    name: "Chat",
    description: "x",
    category: "ai",
    icon: "MessageSquare",
    monthlyPriceCents: 2900,
  });

  const untouched = await editService(repo, service.key, { name: "AI Chat" });
  assert.equal(untouched.icon, "MessageSquare");
  assert.equal(untouched.monthlyPriceCents, 2900);

  const cleared = await editService(repo, service.key, { icon: null });
  assert.equal(cleared.icon, null);
  assert.equal(cleared.monthlyPriceCents, 2900); // untouched by clearing a DIFFERENT field
});

test("editService can toggle isActive -- the catalog-wide retirement switch", async () => {
  const repo = new FakeServiceCatalogRepository();
  const service = await createService(repo, { key: "chat", name: "Chat", description: "x", category: "ai" });
  assert.equal(service.isActive, true);

  const retired = await editService(repo, service.key, { isActive: false });
  assert.equal(retired.isActive, false);
});

test("editService throws service_not_found for an unknown key", async () => {
  const repo = new FakeServiceCatalogRepository();
  await assert.rejects(
    () => editService(repo, "ghost-service", { name: "x" }),
    (err: unknown) => err instanceof ServiceCatalogError && err.code === "service_not_found",
  );
});

test("editService persists the change -- a subsequent read reflects the edit, not just the returned object", async () => {
  const repo = new FakeServiceCatalogRepository();
  const service = await createService(repo, { key: "chat", name: "Chat", description: "x", category: "ai" });
  await editService(repo, service.key, { name: "AI Chat", description: "Updated description" });

  const reread = await repo.getServiceByKey(service.key);
  assert.equal(reread?.name, "AI Chat");
  assert.equal(reread?.description, "Updated description");
});

test("listServiceDependencies resolves to full Service objects, not just ids", async () => {
  const repo = new FakeServiceCatalogRepository();
  const chat = await createService(repo, { key: "chat", name: "Chat", description: "x", category: "ai" });
  const coreIdentity = await createService(repo, { key: "core-identity", name: "Core Identity", description: "x", category: "identity" });
  await addDependency(repo, chat.key, coreIdentity.key);

  const deps = await listServiceDependencies(repo, chat.key);
  assert.equal(deps.length, 1);
  assert.equal(deps[0]!.key, "core-identity");
  assert.equal(deps[0]!.name, "Core Identity");
});

test("listServiceDependencies returns an empty array for a service with no dependencies", async () => {
  const repo = new FakeServiceCatalogRepository();
  const chat = await createService(repo, { key: "chat", name: "Chat", description: "x", category: "ai" });
  const deps = await listServiceDependencies(repo, chat.key);
  assert.deepEqual(deps, []);
});

test("the actual point of this field: tier_included and add_on are distinguishable, even though both reach state \"available\"", async () => {
  const repo = new FakeServiceCatalogRepository();
  await setupCatalog(repo);
  await setTierAvailability(repo, "core-identity", "foundation", "included");
  await setTierAvailability(repo, "developer-sandbox", "foundation", "addable", "price_dev_sandbox");
  await attachAddOn(repo, ORG_ID, "developer-sandbox", "foundation");

  const included = await computeServiceAvailability(repo, ORG_ID, "core-identity", "foundation");
  const addedOn = await computeServiceAvailability(repo, ORG_ID, "developer-sandbox", "foundation");

  assert.deepEqual(included, { state: "available", source: "tier_included" });
  assert.deepEqual(addedOn, { state: "available", source: "add_on" });

  // The actual consequence the distinction exists for: cancelAddOn only
  // works on the genuine add-on selection. Calling it on the
  // tier-included service throws, because there's no OrgServiceSelection
  // row to cancel -- confirming "tier_included" really isn't cancellable
  // the way "add_on" is, not just labeled differently.
  await assert.rejects(
    () => cancelAddOn(repo, ORG_ID, "core-identity"),
    (err: unknown) => err instanceof ServiceCatalogError && err.code === "selection_not_found",
  );
  const stillCancellable = await cancelAddOn(repo, ORG_ID, "developer-sandbox");
  assert.equal(stillCancellable.status, "cancelled");
});
