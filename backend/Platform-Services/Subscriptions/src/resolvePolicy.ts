import type { BillingRepository } from "./billingRepository.js";
import { getPlanForSubscription } from "./subscriptionService.js";
import { defaultPolicyForTier } from "./policy.js";
import type { EntitlementPolicy } from "./types.js";
import type { Organization } from "../../../Customer-Connections/Desktop-Apps/src/types.js";

/**
 * The plan-aware replacement for calling defaultPolicyForTier() directly.
 * Looks up the organization's active subscription and derives the policy
 * from its plan (device cap, allowed channels); if there's no active
 * subscription -- e.g. during the Aegis billing cutover, or an org that
 * predates the subscription system -- falls back to the static
 * trial/standard/enterprise default so nothing that depends on
 * enrollDevice's licensing check breaks.
 *
 * enrollDevice (Customer-Connections/Desktop-Apps) should call this
 * instead of defaultPolicyForTier once callers are ready to pass a
 * BillingRepository through; defaultPolicyForTier remains the fallback
 * path and the one used by any caller that hasn't been updated yet.
 */
export async function resolveEntitlementPolicy(
  billingRepo: BillingRepository,
  organization: Pick<Organization, "id" | "entitlementTier">,
): Promise<EntitlementPolicy> {
  const subscription = await billingRepo.getActiveSubscriptionForOrg(organization.id);
  if (!subscription) {
    return defaultPolicyForTier(organization.entitlementTier);
  }

  const plan = await getPlanForSubscription(billingRepo, subscription);
  return {
    tier: organization.entitlementTier,
    maxDevices: plan.maxDevices,
    allowedChannels: plan.allowedChannels,
    capabilities: plan.includedCapabilities,
  };
}
