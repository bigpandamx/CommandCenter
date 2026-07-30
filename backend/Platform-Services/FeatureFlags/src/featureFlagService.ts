import { randomUUID, createHash } from "node:crypto";
import type { FeatureFlagsRepository } from "./repository.js";
import { FeatureFlagError, type CreateFlagInput, type FeatureFlag } from "./types.js";

const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function createFlag(repo: FeatureFlagsRepository, input: CreateFlagInput, now: Date = new Date()): Promise<FeatureFlag> {
  if (!KEY_PATTERN.test(input.key)) {
    throw new FeatureFlagError(
      `Invalid flag key "${input.key}" -- must be lowercase-with-dashes (e.g. "billing-stripe-adoption")`,
      "invalid_key",
    );
  }
  const rolloutPercentage = input.rolloutPercentage ?? 100;
  if (rolloutPercentage < 0 || rolloutPercentage > 100) {
    throw new FeatureFlagError(`rolloutPercentage must be between 0 and 100, got ${rolloutPercentage}`, "invalid_rollout_percentage");
  }

  const existing = await repo.getFlagByKey(input.key);
  if (existing) {
    throw new FeatureFlagError(`A flag with key "${input.key}" already exists`, "duplicate_key");
  }

  const flag: FeatureFlag = {
    id: randomUUID(),
    key: input.key,
    description: input.description,
    enabled: input.enabled ?? false,
    rolloutPercentage,
    createdAt: now,
    updatedAt: now,
  };
  await repo.createFlag(flag);
  return flag;
}

export async function listFlags(repo: FeatureFlagsRepository): Promise<FeatureFlag[]> {
  return repo.listFlags();
}

export async function getFlag(repo: FeatureFlagsRepository, key: string): Promise<FeatureFlag> {
  const flag = await repo.getFlagByKey(key);
  if (!flag) {
    throw new FeatureFlagError(`No flag with key "${key}"`, "flag_not_found");
  }
  return flag;
}

export async function setFlagEnabled(
  repo: FeatureFlagsRepository,
  key: string,
  enabled: boolean,
  now: Date = new Date(),
): Promise<FeatureFlag> {
  const flag = await getFlag(repo, key);
  const updated: FeatureFlag = { ...flag, enabled, updatedAt: now };
  await repo.updateFlag(updated);
  return updated;
}

export async function setFlagRolloutPercentage(
  repo: FeatureFlagsRepository,
  key: string,
  rolloutPercentage: number,
  now: Date = new Date(),
): Promise<FeatureFlag> {
  if (rolloutPercentage < 0 || rolloutPercentage > 100) {
    throw new FeatureFlagError(`rolloutPercentage must be between 0 and 100, got ${rolloutPercentage}`, "invalid_rollout_percentage");
  }
  const flag = await getFlag(repo, key);
  const updated: FeatureFlag = { ...flag, rolloutPercentage, updatedAt: now };
  await repo.updateFlag(updated);
  return updated;
}

/**
 * Stable 0-99 bucket for (flagKey, organizationId) -- the same pair
 * always lands in the same bucket, so a given org's flag state doesn't
 * flip randomly across requests as a rollout percentage changes; it
 * only crosses the threshold once, in one direction, as the percentage
 * is dialed up (or back down).
 */
function bucketFor(flagKey: string, organizationId: string): number {
  const hex = createHash("sha256").update(`${flagKey}:${organizationId}`).digest("hex");
  const n = parseInt(hex.slice(0, 8), 16);
  return n % 100;
}

/**
 * Evaluates whether a flag is on. Fails closed (returns false) for an
 * unknown/unconfigured key -- an unrecognized flag being treated as "on"
 * would defeat the entire point of a kill switch. Two shapes:
 *
 *   - With organizationId: enabled=false -> always off. Otherwise, the
 *     org's stable bucket (see bucketFor) is compared against
 *     rolloutPercentage -- this is the percentage-rollout path.
 *   - Without organizationId (a global, org-less check): only `enabled`
 *     is honored; rolloutPercentage is ignored, since there's no stable
 *     entity to hash into a bucket. A flag meant to be evaluated as a
 *     rollout should always be checked with an organizationId.
 */
export async function isFeatureEnabled(
  repo: FeatureFlagsRepository,
  key: string,
  organizationId?: string,
): Promise<boolean> {
  const flag = await repo.getFlagByKey(key);
  if (!flag || !flag.enabled) {
    return false;
  }
  if (!organizationId) {
    return true;
  }
  if (flag.rolloutPercentage >= 100) {
    return true;
  }
  if (flag.rolloutPercentage <= 0) {
    return false;
  }
  return bucketFor(key, organizationId) < flag.rolloutPercentage;
}
