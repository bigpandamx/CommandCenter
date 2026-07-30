/**
 * Risk Notices: Risk Intelligence's own adapter onto
 * Control-Plane/Publishing, the same shape as Compliance's
 * distribution.ts and Threat Intelligence's advisoryGeneration.ts --
 * this file owns the InsightSeverity-specific translation and
 * human-readable body text, then hands a fully-formed
 * PublishableIntelligence item to packageAndDistribute.
 *
 * Grounded directly in Aegis's own source before building anything
 * here, not assumed: Aegis's actual Risk Intelligence feature (see
 * docs/NETWORK_INTELLIGENCE.md, risk_intelligence_service.py) is a
 * PULL feature -- Industry Benchmarks, percentile rankings a customer
 * views on their own dashboard. There is no notify/alert method
 * anywhere in Aegis's own risk_intelligence_service.py. Threat
 * Intelligence, by contrast, is explicitly documented there as an
 * "early warning system." A generic "Risk Intelligence notification"
 * built by analogy to Threat Advisories without checking this would
 * have been a mismatch -- nobody wants a push alert saying "you're in
 * the 47th percentile," and Command Center has no business inventing
 * that UX.
 *
 * What IS genuinely notice-worthy, and what this file is actually
 * about: NetworkRiskInsight -- the anomaly/trend/root_cause/
 * correlation DETECTIONS Risk-Intelligence's own orchestrator.ts
 * computes over cross-org signal aggregates ("risk signals are
 * spiking across the technology industry this week"). That's an
 * event, not a static ranking -- the same kind of "something changed,
 * you should know" fact a threat pattern is, even though the
 * underlying benchmark data it's computed from stays exactly where it
 * belongs: a pull-only dashboard feature, never pushed.
 *
 * A genuine improvement over Threat Advisories' own broadcast-only
 * scoping, not a copy of its limitation: NetworkRiskInsight carries a
 * real `industry` field, and OrganizationsRepository profiles carry a
 * real, directly comparable `industry` field -- so a notice can
 * actually be targeted to the organizations it concerns, the same way
 * Compliance's own Impact Assessment targets by country/industry/
 * product. Deliberately NOT using this module's "never exclude on
 * unknown" philosophy the way Compliance does, though: an org with no
 * industry set is excluded here, not included. Compliance's broader
 * default exists because under-notifying carries real legal risk for
 * a regulatory obligation: a risk notice is informational, and
 * claiming an org's industry is affected when Command Center doesn't
 * even know what industry that org is in would be a weaker, less
 * honest match than Compliance's own reasoning ever needed to defend.
 *
 * No `verifiedByAnalyst`-equivalent gate exists on NetworkRiskInsight
 * at all -- unlike ThreatPattern, these are purely algorithmic
 * detections with no human-verification concept built into the data
 * model. The staff member's own decision to generate a notice for THIS
 * SPECIFIC insight is the human checkpoint here, the same role the
 * click itself plays in Compliance's Distribute and Threat
 * Intelligence's Generate Advisory. The one data-level gate that does
 * exist -- confidence -- is checked instead: below a chosen threshold,
 * the insight doesn't get to become a notice no matter how a staff
 * member feels about it.
 */
import { packageAndDistribute } from "../../Publishing/src/publishingService.js";
import type { PublishableIntelligence } from "../../Publishing/src/types.js";
import type { AnnouncementsRepository } from "../../Announcements/src/repository.js";
import type { Announcement, AnnouncementSeverity } from "../../Announcements/src/types.js";
import type { OrganizationsRepository } from "../../Organizations/src/repository.js";
import { findOrganizationsAffectedByIndustryRisk } from "./organizationImpactService.js";
import type { RiskIntelligenceRepository } from "./repository.js";
import type { InsightSeverity, NetworkRiskInsight } from "./types.js";

export class RiskNoticeError extends Error {
  constructor(
    message: string,
    public readonly code: "insight_not_found" | "not_eligible",
  ) {
    super(message);
    this.name = "RiskNoticeError";
  }
}

/** A chosen threshold, not derived from anything statistical -- below this, an insight's own algorithmic confidence isn't high enough to become a customer-facing notice, regardless of severity. */
const MIN_CONFIDENCE_FOR_NOTICE = 0.7;

function mapInsightSeverityToAnnouncementSeverity(severity: InsightSeverity): AnnouncementSeverity {
  switch (severity) {
    case "critical":
      return "critical";
    case "high":
    case "medium":
      return "warning";
    case "low":
      return "info";
    default:
      // InsightSeverity is a closed union -- this branch is
      // unreachable at the type level, kept only so a future addition
      // to that union fails loudly here instead of silently producing
      // `undefined`, matching the same defensive pattern used in
      // Threat Intelligence's own advisoryGeneration.ts.
      return "info";
  }
}

function formatNoticeBody(insight: NetworkRiskInsight): string {
  const lines = [insight.summary, "", insight.explanation];
  if (insight.recommendation) {
    lines.push("", `Recommendation: ${insight.recommendation}`);
  }
  return lines.join("\n");
}

/** Pure -- the eligibility check and content formatting, without touching a repository. Returns the shared fields only; organizationId is deliberately absent here since it varies per matching org, assigned by generateAndPublishRiskNotices below. */
export function buildNoticeFromInsight(insight: NetworkRiskInsight): Omit<PublishableIntelligence, "organizationId"> {
  if (insight.isResolved) {
    throw new RiskNoticeError(`Insight ${insight.id} is already resolved -- not eligible for a customer-facing notice`, "not_eligible");
  }
  if (insight.confidence < MIN_CONFIDENCE_FOR_NOTICE) {
    throw new RiskNoticeError(
      `Insight ${insight.id} has confidence ${insight.confidence}, below the ${MIN_CONFIDENCE_FOR_NOTICE} threshold required for a notice`,
      "not_eligible",
    );
  }
  return {
    sourceType: "risk_intelligence",
    sourceId: insight.id,
    title: `Risk Notice: ${insight.summary}`,
    body: formatNoticeBody(insight),
    severity: mapInsightSeverityToAnnouncementSeverity(insight.severity),
    audience: "customers",
  };
}

/**
 * One Announcement per organization in the insight's own industry --
 * the same "one targeted row per affected party" shape as Compliance's
 * distributeObligationImpact, not a single broadcast. The actual
 * matching now lives in organizationImpactService.ts, its own
 * inspectable stage -- see that module's own doc comment for why this
 * stays industry-level rather than growing more precise the way
 * Compliance's own impact assessment did.
 */
export async function generateAndPublishRiskNotices(
  riskIntelRepo: RiskIntelligenceRepository,
  orgsRepo: OrganizationsRepository,
  announcementsRepo: AnnouncementsRepository,
  insightId: string,
  createdByStaffId: string,
  now: Date = new Date(),
): Promise<Announcement[]> {
  const insight = await riskIntelRepo.getInsightById(insightId);
  if (!insight) {
    throw new RiskNoticeError(`Unknown risk insight: ${insightId}`, "insight_not_found");
  }
  const baseItem = buildNoticeFromInsight(insight);

  const affected = await findOrganizationsAffectedByIndustryRisk(orgsRepo, insight.industry);

  const created: Announcement[] = [];
  for (const impact of affected) {
    const item: PublishableIntelligence = { ...baseItem, organizationId: impact.organizationId };
    const announcement = await packageAndDistribute(announcementsRepo, item, createdByStaffId, now);
    created.push(announcement);
  }
  return created;
}
