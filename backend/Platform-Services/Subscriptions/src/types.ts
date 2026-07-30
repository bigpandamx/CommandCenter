import type { Organization, UpdateChannel } from "../../../Customer-Connections/Desktop-Apps/src/types.js";

/**
 * A gated, purchasable feature -- distinct from a numeric quota
 * (monthlyTokenQuota) or a list-membership check (allowedChannels):
 * this is a plain "does this org's plan include this at all" boolean.
 * Started with just "ai_chat" -- the one real capability gate that
 * exists today (Customer-Connections/AIChat) -- rather than inventing a
 * larger speculative list nothing actually checks yet. Add more here as
 * real features need gating, the same way Capability itself was added
 * once a real need existed, not before.
 */
export type Capability = "ai_chat";

/**
 * What a given entitlement tier is allowed to do. This is the single
 * source of truth for tier limits -- nothing else in the codebase should
 * hardcode a device cap, an allowed-channel list, or a capability grant.
 */
export interface EntitlementPolicy {
  tier: Organization["entitlementTier"];
  /** null = unlimited. */
  maxDevices: number | null;
  allowedChannels: UpdateChannel[];
  capabilities: Capability[];
}

export type LicensingErrorCode = "device_limit_reached" | "channel_not_entitled";
