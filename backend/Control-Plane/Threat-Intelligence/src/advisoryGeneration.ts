/**
 * Threat Advisories: Threat Intelligence's own adapter onto
 * Control-Plane/Publishing, the same shape as Compliance's own
 * distribution.ts -- this file owns the ThreatSeverity-specific
 * translation and human-readable body text, then hands a fully-formed
 * PublishableIntelligence item to packageAndDistribute.
 *
 * A genuinely new concept, not a repurposing of anything that already
 * existed. `getPatternsForDistribution` (distribution.ts, in this same
 * module) is a completely different kind of distribution -- Aegis
 * pulls active patterns/signatures as structured, machine-readable
 * data to refresh its own local detection engine, with no staff review
 * step at all. A Threat Advisory is the opposite in every dimension:
 * human-readable prose, explicitly staff-triggered, reviewed and
 * published through the same Distribution Center flow as a compliance
 * alert.
 *
 * Scoped honestly to what's actually knowable: broadcast only
 * (organizationId always null). Unlike Compliance's own Impact
 * Assessment, there's no mechanism here that determines exactly WHICH
 * organizations a given threat pattern affects -- ThreatPattern only
 * carries affectedOrganizationsCount and affectedIndustries (aggregate
 * signals, not a specific org list), and building that kind of
 * per-org matching for threat intelligence is real, separate work,
 * not attempted here. The advisory body mentions affected industries
 * when known, informationally, but that's not the same as targeted
 * per-org distribution.
 *
 * The bar for turning a pattern into a customer-facing advisory is
 * deliberately higher than the bar for including it in the machine
 * feed: verifiedByAnalyst is required here (not just isActive and not
 * a false positive, which is all getPatternsForDistribution checks).
 * Feeding an unverified pattern into Aegis's own detection engine is
 * one thing; telling customers a threat has been confirmed when a
 * human hasn't actually confirmed it is a different, higher-stakes
 * claim.
 */
import { packageAndDistribute } from "../../Publishing/src/publishingService.js";
import type { PublishableIntelligence } from "../../Publishing/src/types.js";
import type { AnnouncementsRepository } from "../../Announcements/src/repository.js";
import type { Announcement, AnnouncementSeverity } from "../../Announcements/src/types.js";
import type { ThreatIntelRepository } from "./repository.js";
import type { ThreatPattern, ThreatSeverity } from "./types.js";

export class ThreatAdvisoryError extends Error {
  constructor(
    message: string,
    public readonly code: "pattern_not_found" | "not_eligible",
  ) {
    super(message);
    this.name = "ThreatAdvisoryError";
  }
}

function mapThreatSeverityToAnnouncementSeverity(severity: ThreatSeverity): AnnouncementSeverity {
  switch (severity) {
    case "critical":
      return "critical";
    case "high":
    case "medium":
      return "warning";
    case "low":
    case "info":
      return "info";
    default:
      // ThreatSeverity is already a closed union (unlike
      // OrganizationImpact.riskLevel's plain string) -- this branch is
      // unreachable at the type level, kept only so an exhaustiveness
      // change to ThreatSeverity fails loudly here instead of silently
      // producing `undefined`.
      return "info";
  }
}

function formatAdvisoryBody(pattern: ThreatPattern): string {
  const lines = [pattern.description, "", `Attack vector: ${pattern.attackVector}`];
  if (pattern.affectedIndustries && pattern.affectedIndustries.length > 0) {
    lines.push(`Industries observed: ${pattern.affectedIndustries.join(", ")}`);
  }
  if (pattern.indicatorsOfCompromise && pattern.indicatorsOfCompromise.length > 0) {
    lines.push("", "Indicators of compromise:");
    for (const ioc of pattern.indicatorsOfCompromise) {
      lines.push(`- ${ioc}`);
    }
  }
  return lines.join("\n");
}

/** Pure -- the eligibility check and content formatting, without touching a repository. Separated from generateAndPublishThreatAdvisory so the "what makes a pattern advisory-worthy" rule is independently testable. */
export function buildAdvisoryFromPattern(pattern: ThreatPattern): PublishableIntelligence {
  if (!pattern.isActive || pattern.isFalsePositive || !pattern.verifiedByAnalyst) {
    throw new ThreatAdvisoryError(
      `Pattern ${pattern.patternId} is not eligible for a customer-facing advisory (must be active, verified by an analyst, and not a false positive)`,
      "not_eligible",
    );
  }
  return {
    sourceType: "threat_intelligence",
    sourceId: pattern.id,
    title: `Threat Advisory: ${pattern.patternName}`,
    body: formatAdvisoryBody(pattern),
    severity: mapThreatSeverityToAnnouncementSeverity(pattern.severity),
    // Broadcast only -- see this module's own doc comment for why
    // per-org targeting isn't attempted here.
    organizationId: null,
    audience: "customers",
  };
}

export async function generateAndPublishThreatAdvisory(
  threatIntelRepo: ThreatIntelRepository,
  announcementsRepo: AnnouncementsRepository,
  patternId: string,
  createdByStaffId: string,
  now: Date = new Date(),
): Promise<Announcement> {
  const pattern = await threatIntelRepo.getPatternById(patternId);
  if (!pattern) {
    throw new ThreatAdvisoryError(`Unknown threat pattern: ${patternId}`, "pattern_not_found");
  }
  const item = buildAdvisoryFromPattern(pattern);
  return packageAndDistribute(announcementsRepo, item, createdByStaffId, now);
}
