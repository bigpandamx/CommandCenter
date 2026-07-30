import type { ComplianceRepository } from "../../Compliance/src/repository.js";
import type { OrganizationsRepository } from "../../Organizations/src/repository.js";
import type { AnnouncementsRepository } from "../../Announcements/src/repository.js";
import type { ServiceCatalogRepository } from "../../../Platform-Services/ServiceCatalog/src/repository.js";
import type { BillingRepository } from "../../../Platform-Services/Subscriptions/src/billingRepository.js";
import { findAffectedOrganizations } from "../../ImpactAssessment/src/impactEngine.js";
import type {
  ComplianceOperationsDashboard,
  PendingReviewsSummary,
  PublishingQueueSummary,
  SourceHealthEntry,
  SourceHealthStatus,
  TodaysImpactSummary,
} from "./types.js";

/** Below this AI-reported confidence (0-100), an obligation surfaces in "Low Confidence Items" -- a chosen threshold, not derived from anything statistical; picked as a reasonable "worth a second look" line, adjustable if the compliance team's own sense of what needs attention differs. */
const LOW_CONFIDENCE_THRESHOLD = 50;

/** A source is "delayed" once it's this many times overdue relative to its own recorded scheduleIntervalMinutes -- tolerance, not a hard SLA, so a source that's a few minutes late from a scheduling jitter doesn't flip to a warning state every morning. */
const DELAYED_TOLERANCE_MULTIPLIER = 1.5;

function startOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Only active, non-manual sources are meaningful here -- a deactivated
 * source was turned off on purpose (not unhealthy), and a manual
 * source has no fetch cycle at all to be healthy or delayed about (see
 * scheduler.ts's own reasoning for why manual sources are skipped by
 * the real ingestion run too).
 */
export async function computeSourceHealthSummary(
  complianceRepo: ComplianceRepository,
  now: Date = new Date(),
): Promise<SourceHealthEntry[]> {
  const sources = await complianceRepo.listSources({ activeOnly: true });
  return sources
    .filter((s) => s.sourceType !== "manual")
    .map((source) => {
      let status: SourceHealthStatus;
      if (source.lastFetchStatus === "never_run") {
        status = "never_run";
      } else if (source.lastFetchStatus === "error") {
        status = "failed";
      } else if (
        source.scheduleIntervalMinutes !== null &&
        source.lastFetchedAt !== null &&
        now.getTime() - source.lastFetchedAt.getTime() > source.scheduleIntervalMinutes * 60_000 * DELAYED_TOLERANCE_MULTIPLIER
      ) {
        // Last fetch succeeded, but it's overdue for the next one by
        // more than the tolerance -- the source itself hasn't failed,
        // but something (the source's own outage, a scheduler gap) is
        // keeping fresh content from arriving.
        status = "delayed";
      } else {
        status = "healthy";
      }
      return {
        sourceId: source.id,
        sourceName: source.name,
        status,
        lastFetchedAt: source.lastFetchedAt,
        lastFetchError: source.lastFetchError,
      };
    });
}

export async function computePendingReviewsSummary(complianceRepo: ComplianceRepository): Promise<PendingReviewsSummary> {
  const [newRegulations, aiExtractions, pendingReviewObligations] = await Promise.all([
    complianceRepo.countUpdatesByStatus("new"),
    complianceRepo.countObligationsByStatus("pending_review"),
    complianceRepo.listObligationsByStatus("pending_review", { limit: 1000 }),
  ]);

  const lowConfidenceItems = pendingReviewObligations.filter(
    (o) => o.confidence !== null && o.confidence < LOW_CONFIDENCE_THRESHOLD,
  ).length;

  return { newRegulations, aiExtractions, lowConfidenceItems };
}

/**
 * A real, stated performance tradeoff, not an oversight: this walks
 * every regulation ingested today, and for each one with obligations,
 * calls findAffectedOrganizations (which itself re-fetches every
 * organization per call). For a normal day's ingestion volume on an
 * internal morning dashboard, this is a reasonable cost -- the same
 * "don't optimize speculatively, revisit if it becomes a real problem"
 * call made for Control Library's own organizationsImpactedCount,
 * which has the identical shape.
 */
export async function computeTodaysImpactSummary(
  complianceRepo: ComplianceRepository,
  orgsRepo: OrganizationsRepository,
  catalogRepo: ServiceCatalogRepository,
  billingRepo: BillingRepository,
  now: Date = new Date(),
): Promise<TodaysImpactSummary> {
  const todaysUpdates = await complianceRepo.listUpdates({ since: startOfDay(now), limit: 1000 });

  const impactedOrgIds = new Set<string>();
  let criticalAlerts = 0;
  let mediumAlerts = 0;

  for (const update of todaysUpdates) {
    const analysis = await complianceRepo.getAnalysisForUpdate(update.id);
    if (analysis?.riskLevel === "critical") criticalAlerts += 1;
    if (analysis?.riskLevel === "medium") mediumAlerts += 1;

    const obligations = await complianceRepo.listObligationsForUpdate(update.id);
    for (const obligation of obligations) {
      const affected = await findAffectedOrganizations(complianceRepo, orgsRepo, catalogRepo, billingRepo, obligation.id);
      for (const impact of affected) {
        impactedOrgIds.add(impact.organizationId);
      }
    }
  }

  return { organizationsAffected: impactedOrgIds.size, criticalAlerts, mediumAlerts };
}

export async function computePublishingQueueSummary(announcementsRepo: AnnouncementsRepository): Promise<PublishingQueueSummary> {
  const drafts = await announcementsRepo.searchAnnouncements({ status: "draft", limit: 1000 });

  const readyToPublish = drafts.filter((a) => a.organizationId !== null && a.scheduledPublishAt === null).length;
  const scheduled = drafts.filter((a) => a.scheduledPublishAt !== null).length;
  const generalDrafts = drafts.filter((a) => a.organizationId === null && a.scheduledPublishAt === null).length;

  return { readyToPublish, scheduled, drafts: generalDrafts };
}

export async function computeComplianceOperationsDashboard(
  complianceRepo: ComplianceRepository,
  orgsRepo: OrganizationsRepository,
  catalogRepo: ServiceCatalogRepository,
  billingRepo: BillingRepository,
  announcementsRepo: AnnouncementsRepository,
  now: Date = new Date(),
): Promise<ComplianceOperationsDashboard> {
  const [sources, pendingReviews, todaysImpact, publishingQueue] = await Promise.all([
    computeSourceHealthSummary(complianceRepo, now),
    computePendingReviewsSummary(complianceRepo),
    computeTodaysImpactSummary(complianceRepo, orgsRepo, catalogRepo, billingRepo, now),
    computePublishingQueueSummary(announcementsRepo),
  ]);

  return { generatedAt: now, sources, pendingReviews, todaysImpact, publishingQueue };
}
