/**
 * Thin client for Aegis's read-only support-summary endpoint
 * (app/routes/command_center_support.py on Aegis's side). Mirrors
 * adminApiClient.ts's shape (plain async functions, no React/Next
 * dependency, throws a typed error on non-2xx) but is deliberately a
 * separate module and a separate error type -- this is the one
 * integration point in the whole system where Command Center calls
 * INTO Aegis instead of the other direction, authenticated with a
 * single shared secret rather than a staff session token, and it needs
 * to fail soft (see getTechnicalSummaryOrNull) since a support panel
 * being unavailable must never block viewing the ticket it's attached to.
 */

export class AegisSupportError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "AegisSupportError";
  }
}

export interface AegisSupportClientConfig {
  baseUrl: string;
  supportReadKey: string;
}

/**
 * Reads AEGIS_BASE_URL / AEGIS_SUPPORT_READ_KEY from the environment.
 * Returns null if either is unset -- same "absence disables the
 * feature" convention as every other optional integration in this
 * codebase (Stripe, AI Chat). Callers should treat a null config as
 * "don't show this panel", not as an error.
 */
export function getAegisSupportConfigFromEnv(): AegisSupportClientConfig | null {
  const baseUrl = process.env.AEGIS_BASE_URL;
  const supportReadKey = process.env.AEGIS_SUPPORT_READ_KEY;
  if (!baseUrl || !supportReadKey) {
    return null;
  }
  return { baseUrl, supportReadKey };
}

export interface AegisPendingSyncAgent {
  agent_id: string;
  name: string;
  reason: string | null;
}

export interface AegisRecentIssue {
  agent_id: string;
  event_type: string;
  severity: string;
  received_at: string | null;
}

export interface AegisTechnicalSummary {
  total_agents: number;
  agents_by_status: Record<string, number>;
  agents_pending_sync: AegisPendingSyncAgent[];
  recent_issue_window_days: number;
  recent_issue_count: number;
  recent_issues_sample: AegisRecentIssue[];
}

export interface AegisTechnicalSummaryResponse {
  aegis_organization_id: number;
  command_center_org_id: string;
  technical: AegisTechnicalSummary;
}

export async function getTechnicalSummary(
  config: AegisSupportClientConfig,
  commandCenterOrgId: string,
): Promise<AegisTechnicalSummaryResponse> {
  const response = await fetch(
    `${config.baseUrl}/api/v1/command-center-support/organizations/${commandCenterOrgId}/technical-summary`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${config.supportReadKey}` },
    },
  );

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AegisSupportError(
      `Aegis support-summary request failed with status ${response.status}`,
      response.status,
      body,
    );
  }
  return body as AegisTechnicalSummaryResponse;
}

/**
 * getTechnicalSummary, but never throws -- returns null on any failure
 * (not configured, Aegis unreachable, org not linked, anything else).
 * This is what the ticket page should actually call: a support panel
 * that can't load must degrade to "unavailable", never break the page
 * it's attached to.
 */
export async function getTechnicalSummaryOrNull(
  commandCenterOrgId: string,
): Promise<AegisTechnicalSummaryResponse | null> {
  const config = getAegisSupportConfigFromEnv();
  if (!config) {
    return null;
  }
  try {
    return await getTechnicalSummary(config, commandCenterOrgId);
  } catch {
    return null;
  }
}

export interface AegisSubscriptionUsage {
  used: number;
  quota: number | null;
}

/**
 * has_subscription: false means Aegis has no local subscription record
 * for this org at all -- distinct from "unavailable" (getBillingSummaryOrNull
 * returning null), which means the call itself couldn't be made.
 */
export type AegisBillingSummary =
  | { has_subscription: false }
  | {
      has_subscription: true;
      status: string; // Aegis's own SubscriptionStatus vocabulary -- translate via vocabulary.ts before displaying
      plan_code: string;
      plan_name: string;
      current_period_end: string | null;
      stripe_subscription_id: string | null;
      token_usage: AegisSubscriptionUsage;
      request_usage: AegisSubscriptionUsage;
    };

export interface AegisBillingSummaryResponse {
  aegis_organization_id: number;
  command_center_org_id: string;
  billing: AegisBillingSummary;
}

export async function getBillingSummary(
  config: AegisSupportClientConfig,
  commandCenterOrgId: string,
): Promise<AegisBillingSummaryResponse> {
  const response = await fetch(
    `${config.baseUrl}/api/v1/command-center-support/organizations/${commandCenterOrgId}/billing-summary`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${config.supportReadKey}` },
    },
  );

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AegisSupportError(
      `Aegis billing-summary request failed with status ${response.status}`,
      response.status,
      body,
    );
  }
  return body as AegisBillingSummaryResponse;
}

/** getBillingSummary, but never throws -- see getTechnicalSummaryOrNull's doc comment for why. */
export async function getBillingSummaryOrNull(
  commandCenterOrgId: string,
): Promise<AegisBillingSummaryResponse | null> {
  const config = getAegisSupportConfigFromEnv();
  if (!config) {
    return null;
  }
  try {
    return await getBillingSummary(config, commandCenterOrgId);
  } catch {
    return null;
  }
}

export interface AegisAdmin {
  user_id: number;
  username: string;
  email: string;
  full_name: string | null;
  org_role: string;
  account_active: boolean;
  membership_active: boolean;
  joined_org_at: string | null;
  mfa_enabled: boolean;
}

/**
 * last_login_tracked is always false today -- Aegis genuinely doesn't
 * track login events anywhere automatically (see the backend's own
 * get_account_support_summary doc comment). Reported explicitly so the
 * panel can render "not tracked" honestly instead of just omitting the
 * concept, which would look like an oversight rather than a deliberate
 * scoping decision.
 */
export interface AegisAccountSummary {
  admin_count: number;
  admins: AegisAdmin[];
  last_login_tracked: boolean;
}

export interface AegisAccountSummaryResponse {
  aegis_organization_id: number;
  command_center_org_id: string;
  account: AegisAccountSummary;
}

export async function getAccountSummary(
  config: AegisSupportClientConfig,
  commandCenterOrgId: string,
): Promise<AegisAccountSummaryResponse> {
  const response = await fetch(
    `${config.baseUrl}/api/v1/command-center-support/organizations/${commandCenterOrgId}/account-summary`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${config.supportReadKey}` },
    },
  );

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AegisSupportError(
      `Aegis account-summary request failed with status ${response.status}`,
      response.status,
      body,
    );
  }
  return body as AegisAccountSummaryResponse;
}

/** getAccountSummary, but never throws -- see getTechnicalSummaryOrNull's doc comment for why. */
export async function getAccountSummaryOrNull(
  commandCenterOrgId: string,
): Promise<AegisAccountSummaryResponse | null> {
  const config = getAegisSupportConfigFromEnv();
  if (!config) {
    return null;
  }
  try {
    return await getAccountSummary(config, commandCenterOrgId);
  } catch {
    return null;
  }
}
