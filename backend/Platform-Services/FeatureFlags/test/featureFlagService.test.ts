import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createFlag,
  getFlag,
  isFeatureEnabled,
  listFlags,
  setFlagEnabled,
  setFlagRolloutPercentage,
} from "../src/featureFlagService.js";
import { FeatureFlagError } from "../src/types.js";
import { FakeFeatureFlagsRepository } from "./fakeFeatureFlagsRepository.js";

test("createFlag defaults to disabled and full rollout", async () => {
  const repo = new FakeFeatureFlagsRepository();
  const flag = await createFlag(repo, { key: "billing-stripe-adoption", description: "test" });
  assert.equal(flag.enabled, false);
  assert.equal(flag.rolloutPercentage, 100);
});

test("createFlag rejects an invalid key format", async () => {
  const repo = new FakeFeatureFlagsRepository();
  await assert.rejects(
    () => createFlag(repo, { key: "Billing_Stripe Adoption", description: "test" }),
    (err: unknown) => err instanceof FeatureFlagError && err.code === "invalid_key",
  );
});

test("createFlag rejects a duplicate key", async () => {
  const repo = new FakeFeatureFlagsRepository();
  await createFlag(repo, { key: "some-flag", description: "test" });
  await assert.rejects(
    () => createFlag(repo, { key: "some-flag", description: "test again" }),
    (err: unknown) => err instanceof FeatureFlagError && err.code === "duplicate_key",
  );
});

test("createFlag rejects an out-of-range rollout percentage", async () => {
  const repo = new FakeFeatureFlagsRepository();
  await assert.rejects(
    () => createFlag(repo, { key: "some-flag", description: "test", rolloutPercentage: 150 }),
    (err: unknown) => err instanceof FeatureFlagError && err.code === "invalid_rollout_percentage",
  );
});

test("getFlag throws flag_not_found for an unknown key", async () => {
  const repo = new FakeFeatureFlagsRepository();
  await assert.rejects(
    () => getFlag(repo, "does-not-exist"),
    (err: unknown) => err instanceof FeatureFlagError && err.code === "flag_not_found",
  );
});

test("listFlags returns every created flag, sorted by key", async () => {
  const repo = new FakeFeatureFlagsRepository();
  await createFlag(repo, { key: "zeta-flag", description: "z" });
  await createFlag(repo, { key: "alpha-flag", description: "a" });
  const flags = await listFlags(repo);
  assert.deepEqual(flags.map((f) => f.key), ["alpha-flag", "zeta-flag"]);
});

test("setFlagEnabled toggles the master switch", async () => {
  const repo = new FakeFeatureFlagsRepository();
  await createFlag(repo, { key: "some-flag", description: "test" });
  const updated = await setFlagEnabled(repo, "some-flag", true);
  assert.equal(updated.enabled, true);
});

test("setFlagRolloutPercentage rejects an out-of-range value", async () => {
  const repo = new FakeFeatureFlagsRepository();
  await createFlag(repo, { key: "some-flag", description: "test" });
  await assert.rejects(() => setFlagRolloutPercentage(repo, "some-flag", -5));
});

test("isFeatureEnabled fails closed for an unknown flag", async () => {
  const repo = new FakeFeatureFlagsRepository();
  const result = await isFeatureEnabled(repo, "never-created", "org-1");
  assert.equal(result, false);
});

test("isFeatureEnabled is false when the master switch is off, regardless of rollout", async () => {
  const repo = new FakeFeatureFlagsRepository();
  await createFlag(repo, { key: "some-flag", description: "test", enabled: false, rolloutPercentage: 100 });
  assert.equal(await isFeatureEnabled(repo, "some-flag", "org-1"), false);
});

test("isFeatureEnabled with no organizationId only honors the master switch", async () => {
  const repo = new FakeFeatureFlagsRepository();
  await createFlag(repo, { key: "some-flag", description: "test", enabled: true, rolloutPercentage: 0 });
  // rolloutPercentage=0 would normally mean "off for everyone" in the
  // per-org path, but with no org to hash, only `enabled` applies.
  assert.equal(await isFeatureEnabled(repo, "some-flag"), true);
});

test("isFeatureEnabled is true for every org at 100% rollout", async () => {
  const repo = new FakeFeatureFlagsRepository();
  await createFlag(repo, { key: "some-flag", description: "test", enabled: true, rolloutPercentage: 100 });
  for (let i = 0; i < 20; i++) {
    assert.equal(await isFeatureEnabled(repo, "some-flag", randomUUID()), true);
  }
});

test("isFeatureEnabled is false for every org at 0% rollout", async () => {
  const repo = new FakeFeatureFlagsRepository();
  await createFlag(repo, { key: "some-flag", description: "test", enabled: true, rolloutPercentage: 0 });
  for (let i = 0; i < 20; i++) {
    assert.equal(await isFeatureEnabled(repo, "some-flag", randomUUID()), false);
  }
});

test("isFeatureEnabled is stable -- the same org always gets the same result for a given flag", async () => {
  const repo = new FakeFeatureFlagsRepository();
  await createFlag(repo, { key: "some-flag", description: "test", enabled: true, rolloutPercentage: 50 });
  const orgId = randomUUID();
  const first = await isFeatureEnabled(repo, "some-flag", orgId);
  for (let i = 0; i < 10; i++) {
    assert.equal(await isFeatureEnabled(repo, "some-flag", orgId), first);
  }
});

test("isFeatureEnabled at 50% rollout lands roughly half of a large org sample in each bucket", async () => {
  const repo = new FakeFeatureFlagsRepository();
  await createFlag(repo, { key: "some-flag", description: "test", enabled: true, rolloutPercentage: 50 });

  const sampleSize = 2000;
  let enabledCount = 0;
  for (let i = 0; i < sampleSize; i++) {
    if (await isFeatureEnabled(repo, "some-flag", randomUUID())) {
      enabledCount++;
    }
  }

  // Statistical, not exact -- generous tolerance to avoid flakiness
  // while still catching a genuinely broken distribution (e.g. always
  // true, always false, or a badly skewed hash).
  const ratio = enabledCount / sampleSize;
  assert.ok(ratio > 0.4 && ratio < 0.6, `expected ~50% enabled, got ${(ratio * 100).toFixed(1)}%`);
});

test("isFeatureEnabled distinguishes different orgs from each other at a partial rollout", async () => {
  const repo = new FakeFeatureFlagsRepository();
  await createFlag(repo, { key: "some-flag", description: "test", enabled: true, rolloutPercentage: 50 });

  const results = new Set<boolean>();
  for (let i = 0; i < 50; i++) {
    results.add(await isFeatureEnabled(repo, "some-flag", randomUUID()));
  }
  // Not every org should land in the same bucket -- both true and false should appear.
  assert.equal(results.size, 2);
});
