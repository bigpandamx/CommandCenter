/**
 * Compliance Operations Dashboard -- the single screen a compliance
 * team actually opens every morning. Reinforces Command Center as an
 * operations platform, not a customer-facing application: every number
 * here composes an already-existing, already-tested capability from
 * elsewhere in this codebase (source fetch tracking, the Incoming
 * Queue, Obligation Review's confidence field, Impact Assessment, and
 * Distribution Center's own scheduling) -- nothing new is computed
 * from scratch, this only aggregates and presents.
 *
 * A few interpretation choices, made explicitly rather than guessed
 * silently -- see dashboardService.ts's own comments for the full
 * reasoning on each:
 * - "AI Extractions" means obligations with review status
 *   "pending_review" (an obligation just extracted by AI Analysis and
 *   not yet reviewed) -- not a new concept, ObligationReviewStatus
 *   already models exactly this.
 * - "Critical Alerts" / "Medium Alerts" count DISTINCT REGULATIONS
 *   (ComplianceUpdate rows) analyzed today at that risk level, not
 *   Announcement.severity -- severity collapses "high" and "medium"
 *   into one "warning" bucket (see distribution.ts's own
 *   mapRiskLevelToSeverity), which would silently lose the distinction
 *   this dashboard is specifically asking for.
 * - "Ready to Publish" / "Drafts" split unscheduled drafts by whether
 *   they're compliance alerts (organizationId set, created by
 *   Distribution) or general staff-authored announcements
 *   (organizationId null) -- two genuinely different categories of
 *   unpublished work, not the same bucket counted twice.
 */

export type SourceHealthStatus = "healthy" | "delayed" | "failed" | "never_run";

export interface SourceHealthEntry {
  sourceId: string;
  sourceName: string;
  status: SourceHealthStatus;
  lastFetchedAt: Date | null;
  lastFetchError: string | null;
}

export interface PendingReviewsSummary {
  /** Updates still in the Incoming Queue's "new" status -- not yet triaged at all. */
  newRegulations: number;
  /** Obligations with review status "pending_review" -- AI-extracted, not yet approved or rejected by a staff member. */
  aiExtractions: number;
  /** The subset of pending-review obligations whose AI-reported confidence is below LOW_CONFIDENCE_THRESHOLD -- see dashboardService.ts. */
  lowConfidenceItems: number;
}

export interface TodaysImpactSummary {
  /** The union of organizations affected by any obligation belonging to a regulation ingested today -- deduplicated, same "union not sum" discipline as Control Library's own organizationsImpactedCount. */
  organizationsAffected: number;
  /** Distinct regulations (ComplianceUpdate rows) analyzed today with riskLevel "critical". */
  criticalAlerts: number;
  /** Distinct regulations analyzed today with riskLevel "medium". */
  mediumAlerts: number;
}

export interface PublishingQueueSummary {
  /** Unscheduled draft compliance alerts (organizationId set) -- created by Distribution, awaiting a publish decision. */
  readyToPublish: number;
  /** Every scheduled draft, alert or general -- has a scheduledPublishAt set, regardless of organizationId. */
  scheduled: number;
  /** Unscheduled draft GENERAL announcements (organizationId null) -- staff-authored, not tied to a specific obligation's distribution. */
  drafts: number;
}

export interface ComplianceOperationsDashboard {
  generatedAt: Date;
  sources: SourceHealthEntry[];
  pendingReviews: PendingReviewsSummary;
  todaysImpact: TodaysImpactSummary;
  publishingQueue: PublishingQueueSummary;
}
