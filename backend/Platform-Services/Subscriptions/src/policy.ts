import type { Organization } from "../../../Customer-Connections/Desktop-Apps/src/types.js";
import type { EntitlementPolicy } from "./types.js";

/**
 * Default policy per tier. These are intentionally conservative starting
 * points, not final business numbers -- whoever owns pricing should treat
 * this function as the one place to change them, not something to
 * override ad hoc elsewhere. Capability defaults follow the same
 * conservative-placeholder spirit: trial gets none of the gated
 * capabilities, standard and enterprise get ai_chat. Change these here,
 * not by special-casing a tier check somewhere else.
 */
export function defaultPolicyForTier(
  tier: Organization["entitlementTier"],
): EntitlementPolicy {
  switch (tier) {
    case "trial":
      return { tier, maxDevices: 3, allowedChannels: ["beta"], capabilities: [] };
    case "standard":
      return { tier, maxDevices: 25, allowedChannels: ["stable"], capabilities: ["ai_chat"] };
    case "enterprise":
      return { tier, maxDevices: null, allowedChannels: ["stable", "beta", "canary"], capabilities: ["ai_chat"] };
  }
}
