/**
 * Canonical cross-system vocabulary crosswalk between Command Center and
 * Aegis. See VOCABULARY.md at the repo root for the full glossary this
 * module implements a piece of -- this file and its Aegis-side mirror
 * (app/core/command_center_vocabulary.py) must be kept in sync with each
 * other and with that doc. There is no way to enforce that automatically
 * across a Python/TypeScript boundary; the discipline is: whenever either
 * system's enum changes, update the doc AND both mapping modules in the
 * same change, and rely on each side's own drift-detection test (see
 * AGENT_STATUS_VALUES below and its test) to catch a one-sided edit.
 */

import type { SubscriptionStatus as CommandCenterSubscriptionStatus } from "./billingTypes.js";

/**
 * Aegis's local app.models.subscription.SubscriptionStatus values,
 * mirrored here as a literal type (not imported -- there's no shared
 * module across the Python/TypeScript boundary). If Aegis's enum
 * changes, this type and AEGIS_TO_COMMAND_CENTER_STATUS below need a
 * matching update.
 */
export type AegisSubscriptionStatus = "trial" | "active" | "past_due" | "suspended" | "cancelled" | "expired";

/**
 * The only genuine vocabulary mismatch found between the two systems'
 * subscription status enums: Aegis says "trial", Command Center says
 * "trialing". Every other value is identical string-for-string.
 * Deliberately explicit (a full lookup table, not "just append -ing")
 * so this stays correct even if the two enums diverge further later --
 * a future new Aegis status doesn't silently fall through some pattern
 * transformation, it has to be added here explicitly or this table
 * stops being exhaustive (see the exhaustiveness check below).
 */
const AEGIS_TO_COMMAND_CENTER_STATUS: Record<AegisSubscriptionStatus, CommandCenterSubscriptionStatus> = {
  trial: "trialing",
  active: "active",
  past_due: "past_due",
  suspended: "suspended",
  cancelled: "cancelled",
  expired: "expired",
};

const COMMAND_CENTER_TO_AEGIS_STATUS: Record<CommandCenterSubscriptionStatus, AegisSubscriptionStatus> = {
  trialing: "trial",
  active: "active",
  past_due: "past_due",
  suspended: "suspended",
  cancelled: "cancelled",
  expired: "expired",
};

export function aegisToCommandCenterSubscriptionStatus(
  status: AegisSubscriptionStatus,
): CommandCenterSubscriptionStatus {
  return AEGIS_TO_COMMAND_CENTER_STATUS[status];
}

export function commandCenterToAegisSubscriptionStatus(
  status: CommandCenterSubscriptionStatus,
): AegisSubscriptionStatus {
  return COMMAND_CENTER_TO_AEGIS_STATUS[status];
}

/**
 * Aegis's app.models.enforcement_agent.AgentStatus values, mirrored here
 * for the drift-detection test in vocabulary.test.ts. Unlike subscription
 * status, this one is NOT translated -- Aegis's AgentStatus and Command
 * Center's EdgeDeviceStatus (Customer-Connections/Edge-Devices/src/types.ts)
 * were deliberately designed to use identical string values, so an
 * enforcement agent's status can be forwarded as-is via the
 * policy_sync_ack / edge-device events path without any mapping
 * function at all. That alignment is easy to break silently (someone
 * adds a new Aegis AgentStatus value without knowing Command Center has
 * an equivalent enum it should stay in sync with) -- this constant plus
 * its test is what catches that on Command Center's side. There's no
 * way to catch it from Aegis's side changing without a corresponding
 * test there too (see command_center_vocabulary.py's own copy of this
 * check).
 */
export const EXPECTED_AEGIS_AGENT_STATUS_VALUES = ["provisioning", "active", "degraded", "offline", "inactive"] as const;
