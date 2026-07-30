/**
 * Distribution: turns an obligation's impact assessment into real,
 * targeted Announcement rows -- one per affected organization, each
 * scoped via Announcement.organizationId (see
 * 0034_announcement_organization_scope.sql) so it only reaches that
 * org's own readers, not every "customers"-audience org regardless of
 * whether they're actually affected.
 *
 * Compliance's own adapter onto Control-Plane/Publishing -- this file
 * owns the Compliance-specific translation (riskLevel's own vocabulary
 * into a normalized AnnouncementSeverity, the human-readable body
 * text), then hands a fully-formed PublishableIntelligence item to
 * packageAndDistribute, which is domain-agnostic and doesn't know or
 * care that any of this came from a compliance obligation specifically.
 * Threat Intelligence's own advisoryGeneration.ts is the same shape,
 * translating ITS OWN severity vocabulary independently -- see
 * Publishing/src/types.ts for why that split is deliberate.
 *
 * Created as drafts, same as every other announcement -- distribution
 * doesn't override createAnnouncement's own "publishing is a separate,
 * explicit step" design (enforced now by packageAndDistribute, not
 * re-decided here). That default matters more here than elsewhere:
 * riskLevel/actionItems trace back to an obligation's own AI Analysis,
 * and unreviewed AI-influenced compliance content reaching potentially
 * many organizations unreviewed is exactly the class of risk that
 * design already guards against. A staff member reviews and publishes
 * via the existing announcement management flow -- no new bulk-publish
 * mechanism was built for this, deliberately: reusing the existing
 * one-by-one review step is the safer default until there's a concrete
 * reason a batch of AI-influenced alerts should bypass it.
 */
import { packageAndDistribute } from "../../Publishing/src/publishingService.js";
import type { PublishableIntelligence } from "../../Publishing/src/types.js";
import type { AnnouncementsRepository } from "../../Announcements/src/repository.js";
import type { Announcement, AnnouncementSeverity } from "../../Announcements/src/types.js";
import type { ComplianceRepository } from "../../Compliance/src/repository.js";
import type { OrganizationsRepository } from "../../Organizations/src/repository.js";
import type { ServiceCatalogRepository } from "../../../Platform-Services/ServiceCatalog/src/repository.js";
import type { BillingRepository } from "../../../Platform-Services/Subscriptions/src/billingRepository.js";
import { findAffectedOrganizations } from "./impactEngine.js";
import { ImpactAssessmentError, type OrganizationImpact } from "./types.js";

function mapRiskLevelToSeverity(riskLevel: string | null): AnnouncementSeverity {
  switch (riskLevel) {
    case "critical":
      return "critical";
    case "high":
    case "medium":
      return "warning";
    case "low":
      return "info";
    default:
      // Covers null (document not yet analyzed) and any value outside
      // the known ComplianceRiskLevel set -- OrganizationImpact.riskLevel
      // is typed as a plain string, not the narrow union, specifically
      // so a value this mapping doesn't recognize degrades to the
      // least-alarming severity rather than throwing or silently
      // matching "critical" by accident.
      return "info";
  }
}

function formatBody(impact: OrganizationImpact): string {
  const lines = [...impact.reasons];
  if (impact.actionItems.length > 0) {
    lines.push("", "Recommended actions:");
    for (const item of impact.actionItems) {
      lines.push(`- ${item}`);
    }
  }
  return lines.join("\n");
}

export async function distributeObligationImpact(
  complianceRepo: ComplianceRepository,
  orgsRepo: OrganizationsRepository,
  catalogRepo: ServiceCatalogRepository,
  billingRepo: BillingRepository,
  announcementsRepo: AnnouncementsRepository,
  obligationId: string,
  createdByStaffId: string,
  now: Date = new Date(),
): Promise<Announcement[]> {
  // Fetched directly here (not just via findAffectedOrganizations
  // below) specifically for update.title -- a real, human-readable
  // document title, unlike the obligation's own `description` (a
  // legal-clause description, not a title). Both are single indexed
  // lookups (see getObligationById's own doc comment on why it exists
  // at all), so this is one extra cheap fetch, not a new O(n) scan.
  const obligation = await complianceRepo.getObligationById(obligationId);
  if (!obligation) {
    throw new ImpactAssessmentError(`Unknown obligation: ${obligationId}`, "obligation_not_found");
  }
  const update = await complianceRepo.getUpdateById(obligation.updateId);
  if (!update) {
    throw new ImpactAssessmentError(
      `Obligation ${obligationId} references missing update ${obligation.updateId}`,
      "update_not_found",
    );
  }

  const affected = await findAffectedOrganizations(complianceRepo, orgsRepo, catalogRepo, billingRepo, obligationId);

  const created: Announcement[] = [];
  for (const impact of affected) {
    const item: PublishableIntelligence = {
      sourceType: "compliance",
      sourceId: obligationId,
      title: `Compliance Impact: ${update.title}`,
      body: formatBody(impact),
      audience: "customers",
      severity: mapRiskLevelToSeverity(impact.riskLevel),
      organizationId: impact.organizationId,
    };
    const announcement = await packageAndDistribute(announcementsRepo, item, createdByStaffId, now);
    created.push(announcement);
  }
  return created;
}
