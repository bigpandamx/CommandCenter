export interface FeatureFlag {
  id: string;
  /** Stable identifier used in code, e.g. "billing-stripe-adoption". Never renamed once shipped -- code references it by this string. */
  key: string;
  description: string;
  /** The master switch. false means off for everyone regardless of rolloutPercentage. */
  enabled: boolean;
  /** 0-100. Only meaningful when evaluated with an organizationId (see isFeatureEnabled) -- ignored for org-less checks, which only honor `enabled`. */
  rolloutPercentage: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFlagInput {
  key: string;
  description: string;
  /** Defaults to false -- a newly created flag starts off. New capabilities should be flagged off until deliberately turned on, not the other way around. */
  enabled?: boolean;
  /** Defaults to 100 -- once enabled, fully on for everyone unless a rollout is explicitly configured. */
  rolloutPercentage?: number;
}

export class FeatureFlagError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_key" | "duplicate_key" | "flag_not_found" | "invalid_rollout_percentage",
  ) {
    super(message);
    this.name = "FeatureFlagError";
  }
}
