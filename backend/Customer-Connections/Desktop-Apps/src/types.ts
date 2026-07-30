/**
 * Shared types for the Aegis Desktop <-> Command Center sync protocol.
 *
 * These types are intentionally framework- and driver-agnostic. The HTTP
 * transport (backend/api) and persistence (Platform-Services/Databases) layers
 * depend on this module -- this module depends on nothing.
 */

export type UpdateChannel = "stable" | "beta" | "canary";

export type DeviceStatus = "active" | "revoked" | "suspended";

export interface Organization {
  id: string;
  name: string;
  /** Entitlement tier gates which update channels / features a device may use. */
  entitlementTier: "trial" | "standard" | "enterprise";
  /** Undefined/null until this org's first paid (non-trial) subscription is created -- see ensureStripeCustomer in stripeIntegration.ts. Trial orgs never need one. Optional (not required, defaults to undefined) so the ~14 existing call sites that construct an Organization without Stripe in mind keep working unchanged -- same convention as includedCapabilities below. */
  stripeCustomerId?: string | null;
  createdAt: Date;
}

/**
 * A single-use (or admin-defined-expiry) token generated inside Command
 * Center by an org admin and handed to whoever is installing Aegis. Consumed
 * exactly once by POST /v1/enroll.
 */
export interface EnrollmentToken {
  token: string;
  organizationId: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  /** Optional cap on how many devices a single token may enroll (default 1). */
  maxUses: number;
  useCount: number;
}

/**
 * A registered Aegis desktop installation. `apiKeyHash` is the only
 * long-lived secret material and is never returned after enrollment.
 */
export interface Device {
  id: string;
  organizationId: string;
  apiKeyHash: string;
  /** Stable hardware/install fingerprint, used to detect re-enrollment of the same machine. */
  fingerprint: string;
  displayName: string;
  platform: "windows" | "macos" | "linux";
  appVersion: string;
  channel: UpdateChannel;
  status: DeviceStatus;
  enrolledAt: Date;
  lastCheckinAt: Date | null;
}

export interface CheckinRequest {
  deviceId: string;
  appVersion: string;
  /** Coarse health snapshot -- kept intentionally small; bulk telemetry goes through /v1/telemetry, not check-in. */
  health: {
    uptimeSeconds: number;
    lastErrorCode: string | null;
  };
}

export interface PendingCommand {
  id: string;
  type: "update_now" | "revoke" | "rotate_key" | "resync_config";
  issuedAt: Date;
  payload?: Record<string, unknown>;
}

export interface CheckinResponse {
  serverTime: string;
  updateAvailable: boolean;
  latestVersion: string | null;
  commands: PendingCommand[];
  nextCheckinSeconds: number;
}

export interface UpdateManifestEntry {
  version: string;
  channel: UpdateChannel;
  platform: Device["platform"];
  publishedAt: Date;
  downloadUrl: string;
  sha256: string;
  /** Minimum version that can apply this update directly (below this, client must step through an intermediate version). */
  minUpgradeFrom: string | null;
}

export interface ResolvedUpdate {
  updateAvailable: boolean;
  manifest: UpdateManifestEntry | null;
}

/**
 * Closed set of telemetry event kinds -- deliberately not a free-form
 * string. Adding a new kind is a one-line type change and forces a
 * conscious decision about what it means, rather than silently accepting
 * whatever a device sends.
 */
export type TelemetryEventType =
  | "conmon_report"
  | "usage_metric"
  | "error_report"
  | "health_snapshot";

export interface TelemetryEventInput {
  type: TelemetryEventType;
  /** When the event actually happened on the device, not when it was received. */
  occurredAt: Date;
  payload: Record<string, unknown>;
}

export interface TelemetryEvent extends TelemetryEventInput {
  id: string;
  deviceId: string;
  organizationId: string;
  receivedAt: Date;
}

export interface TelemetryIngestRequest {
  deviceId: string;
  events: TelemetryEventInput[];
}

export interface TelemetryIngestResponse {
  accepted: number;
  receivedAt: string;
}
