/**
 * Resolves what the billing panel should show for one organization.
 * Three states, in priority order:
 *
 *   1. "command_center" -- Command Center already has a local
 *      subscription for this org (via adoptExistingStripeSubscription
 *      or a fresh CC-native signup). This IS the authoritative record
 *      now; rendered directly, no Aegis call needed for the primary
 *      view. A lightweight drift check still runs (see below).
 *   2. "aegis" -- Command Center has no local subscription, but Aegis
 *      does. This org hasn't been migrated yet (see
 *      BILLING_CUTOVER_RUNBOOK.md) -- shown clearly labeled as
 *      Aegis-reported, not as if it were Command Center's own record.
 *   3. "none" -- neither system has a subscription on record.
 *
 * Drift check (state 1 only): also fetches Aegis's copy and compares
 * status, translated through the same Aegis<->Command Center
 * vocabulary mapping documented in VOCABULARY.md and implemented on the
 * backend in Platform-Services/Subscriptions/src/vocabulary.ts. This is
 * a DELIBERATELY MINIMAL mirror of that one lookup table, not a shared
 * import -- frontend/ and backend/ are separate npm workspaces with no
 * dependency between them today, and introducing one just for a single
 * six-entry table isn't worth it yet. If Aegis's SubscriptionStatus or
 * Command Center's SubscriptionStatus enum changes, this table, the
 * backend's vocabulary.ts, and VOCABULARY.md all need updating together
 * -- same discipline note as the backend module's own doc comment.
 *
 * Deliberately simple: a single status comparison producing a warning
 * string, not a full field-by-field diff UI. If drift turns out to be
 * common in practice, that's the signal to build something richer.
 */

import { getOrganizationUsage, type AdminApiClientConfig } from "./adminApiClient";
import { AdminApiError } from "./adminApiClient";
import { getBillingSummaryOrNull, type AegisBillingSummary } from "./aegisSupportClient";

const AEGIS_TO_COMMAND_CENTER_STATUS: Record<string, string> = {
  trial: "trialing",
  active: "active",
  past_due: "past_due",
  suspended: "suspended",
  cancelled: "cancelled",
  expired: "expired",
};

function translateAegisStatus(aegisStatus: string): string {
  return AEGIS_TO_COMMAND_CENTER_STATUS[aegisStatus] ?? aegisStatus;
}

export interface CommandCenterSourcedBilling {
  source: "command_center";
  planCode: string;
  status: string;
  usage: {
    tokens: { used: number; limit: number | null; remaining: number | null };
    requests: { used: number; limit: number | null; remaining: number | null };
  };
  /** Set only when Aegis's own copy disagrees on status -- see module doc comment. Absent (not false) when no drift, so callers can just check truthiness. */
  driftWarning?: string;
}

export interface AegisSourcedBilling {
  source: "aegis";
  planCode: string;
  planName: string;
  /** Already translated into Command Center's vocabulary -- callers never see Aegis's raw "trial". */
  status: string;
  currentPeriodEnd: string | null;
  usage: {
    tokens: { used: number; limit: number | null };
    requests: { used: number; limit: number | null };
  };
}

export interface NoBillingRecord {
  source: "none";
}

export type BillingSummary = CommandCenterSourcedBilling | AegisSourcedBilling | NoBillingRecord;

export async function resolveBillingSummary(
  adminApiConfig: AdminApiClientConfig,
  organizationId: string,
): Promise<BillingSummary> {
  const commandCenterUsage = await tryGetCommandCenterUsage(adminApiConfig, organizationId);

  if (commandCenterUsage) {
    const result: CommandCenterSourcedBilling = {
      source: "command_center",
      planCode: commandCenterUsage.planCode,
      status: commandCenterUsage.subscriptionStatus,
      usage: commandCenterUsage.usage,
    };

    const aegisSummary = await getBillingSummaryOrNull(organizationId);
    const drift = detectDrift(commandCenterUsage.subscriptionStatus, aegisSummary?.billing);
    if (drift) {
      result.driftWarning = drift;
    }
    return result;
  }

  const aegisSummary = await getBillingSummaryOrNull(organizationId);
  if (aegisSummary && aegisSummary.billing.has_subscription) {
    const billing = aegisSummary.billing;
    return {
      source: "aegis",
      planCode: billing.plan_code,
      planName: billing.plan_name,
      status: translateAegisStatus(billing.status),
      currentPeriodEnd: billing.current_period_end,
      usage: {
        tokens: { used: billing.token_usage.used, limit: billing.token_usage.quota },
        requests: { used: billing.request_usage.used, limit: billing.request_usage.quota },
      },
    };
  }

  return { source: "none" };
}

async function tryGetCommandCenterUsage(adminApiConfig: AdminApiClientConfig, organizationId: string) {
  try {
    return await getOrganizationUsage(adminApiConfig, organizationId);
  } catch (err) {
    // 404 (no active subscription) is a normal state here, not a
    // failure -- collapse it, and any other error, to "Command Center
    // has nothing to show", falling back to Aegis's copy. A real
    // transient failure and a genuine "not adopted yet" org get the
    // same fallback behavior, which is the right call for a support
    // panel: showing Aegis's data (if any) is more useful than an
    // error state either way.
    if (err instanceof AdminApiError && err.status === 404) {
      return null;
    }
    return null;
  }
}

function detectDrift(commandCenterStatus: string, aegisBilling: AegisBillingSummary | undefined): string | null {
  if (!aegisBilling || !aegisBilling.has_subscription) {
    return null;
  }
  const aegisStatusInCommandCenterTerms = translateAegisStatus(aegisBilling.status);
  if (aegisStatusInCommandCenterTerms !== commandCenterStatus) {
    return `Aegis reports status "${aegisBilling.status}" (${aegisStatusInCommandCenterTerms}), which doesn't match Command Center's own "${commandCenterStatus}".`;
  }
  return null;
}
