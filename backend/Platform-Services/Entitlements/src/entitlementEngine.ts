import type { Organization, UpdateChannel } from "../../../Customer-Connections/Desktop-Apps/src/types.js";
import type { BillingRepository } from "../../Subscriptions/src/billingRepository.js";
import { resolveEntitlementPolicy } from "../../Subscriptions/src/resolvePolicy.js";
import { assertDeviceEnrollmentAllowed, assertChannelAllowed, LicensingError } from "../../Subscriptions/src/enforcement.js";
import type { Capability, EntitlementPolicy } from "../../Subscriptions/src/types.js";

/**
 * The single source of truth for "is this organization allowed to do X
 * right now," promoted out of scattered ad-hoc checks the same way
 * Subscriptions itself was promoted out of Databases. Before this
 * existed: device-cap enforcement lived in Desktop-Apps' enrollDevice
 * (via the un-plan-aware defaultPolicyForTier -- resolveEntitlementPolicy
 * was built but never actually wired in, a gap CUTOVER.md had named for
 * several sessions), and AI Chat's quota check was written directly
 * inline in chatService.ts with no equivalent "is this even included in
 * your plan" gate at all -- any org could call AI Chat regardless of
 * plan, only getting token-limited after the fact.
 *
 * Every check funnels through one function (`checkEntitlement`) taking
 * a typed `EntitlementOperation` describing what's being attempted,
 * rather than a different named function per concern -- "every service
 * calls the Entitlement Engine" should mean one call shape, not three
 * similar-but-different ones a caller has to choose between.
 *
 * This module resolves *policy* (via Subscriptions' resolveEntitlementPolicy)
 * and *decides*; it does not duplicate Subscriptions' own threshold
 * logic (assertDeviceEnrollmentAllowed, assertChannelAllowed) -- it
 * calls those directly against the resolved policy, so the actual
 * boundary conditions (what counts as "at the cap") live in exactly one
 * place, not two copies that could drift apart.
 *
 * Deliberately does NOT cover numeric usage/quota tracking (tokens,
 * requests) -- that's Subscriptions' usageService.ts, a fundamentally
 * different shape of check (consumption already happened, cost only
 * known after the fact -- see recordUsageUnconditional's own doc
 * comment for why that can't be a simple before-the-fact gate the way
 * capability/device-cap/channel checks are).
 */

export type EntitlementOperation =
  | { type: "capability"; capability: Capability }
  | { type: "device_enrollment"; currentDeviceCount: number }
  | { type: "channel"; channel: UpdateChannel };

export interface EntitlementCheckResult {
  allowed: boolean;
  reason?: string;
  /** The resolved policy this decision was made against -- useful for a caller that wants to show more than just yes/no (e.g. "you're on the trial tier, upgrade for AI Chat"). */
  policy: EntitlementPolicy;
}

export class EntitlementError extends Error {
  constructor(
    message: string,
    public readonly operation: EntitlementOperation,
  ) {
    super(message);
    this.name = "EntitlementError";
  }
}

function describeOperation(operation: EntitlementOperation): string {
  switch (operation.type) {
    case "capability":
      return `capability "${operation.capability}"`;
    case "device_enrollment":
      return "device enrollment";
    case "channel":
      return `update channel "${operation.channel}"`;
  }
}

/**
 * Resolves the organization's current policy and checks it against the
 * requested operation. Never throws for a normal "not entitled" outcome
 * -- that's a legitimate, expected result a caller should branch on
 * (show an upgrade prompt, a 403, whatever fits), not an exceptional
 * condition. See `assertEntitled` for the throwing convenience wrapper.
 */
export async function checkEntitlement(
  billingRepo: BillingRepository,
  organization: Pick<Organization, "id" | "entitlementTier">,
  operation: EntitlementOperation,
): Promise<EntitlementCheckResult> {
  const policy = await resolveEntitlementPolicy(billingRepo, organization);

  try {
    switch (operation.type) {
      case "capability":
        if (!policy.capabilities.includes(operation.capability)) {
          return {
            allowed: false,
            reason: `The ${policy.tier} tier does not include ${describeOperation(operation)}`,
            policy,
          };
        }
        break;
      case "device_enrollment":
        assertDeviceEnrollmentAllowed(policy, operation.currentDeviceCount);
        break;
      case "channel":
        assertChannelAllowed(policy, operation.channel);
        break;
    }
  } catch (err) {
    if (err instanceof LicensingError) {
      return { allowed: false, reason: err.message, policy };
    }
    throw err;
  }

  return { allowed: true, policy };
}

/**
 * Throwing convenience wrapper, matching the assert-style pattern used
 * throughout the rest of this codebase (assertWithinQuota,
 * assertDeviceEnrollmentAllowed, ...). Returns the resolved policy on
 * success, since a caller that just asserted entitlement often also
 * needs the policy for something else right after (e.g. enrollDevice
 * needs the resolved allowedChannels to pick a default channel).
 */
export async function assertEntitled(
  billingRepo: BillingRepository,
  organization: Pick<Organization, "id" | "entitlementTier">,
  operation: EntitlementOperation,
): Promise<EntitlementPolicy> {
  const result = await checkEntitlement(billingRepo, organization, operation);
  if (!result.allowed) {
    throw new EntitlementError(result.reason ?? `Not entitled: ${describeOperation(operation)}`, operation);
  }
  return result.policy;
}
