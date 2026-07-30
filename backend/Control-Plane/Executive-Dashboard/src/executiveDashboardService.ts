/**
 * Executive Dashboard: a strategic, cross-cutting aggregate view for
 * executives and CISOs, requested as eight components (overall
 * organizational risk score, compliance score, asset health, threat
 * activity, business impact, financial exposure, risk trends over
 * time, AI-generated executive summaries). Investigated each against
 * this codebase's actual data before building anything -- this is
 * exactly the kind of dashboard where a fabricated number is worse
 * than an absent one, since a CISO could reasonably act on it.
 *
 * Confirmed with the user before building: only four of the eight
 * have real data behind them today, and this file computes exactly
 * those four, honestly labeled for what they actually are rather than
 * what the original ask implied:
 *
 *  - Threat activity: real (Threat-Intelligence's own active
 *    patterns/actors/campaigns, critical and KEV vulnerabilities).
 *  - Compliance COVERAGE, not "compliance score": computeFrameworkCoverage
 *    already exists and measures what fraction of a framework's
 *    controls have a mapped obligation -- that's coverage, not "are we
 *    actually compliant" (an obligation can be mapped without being
 *    satisfied). Presented under that name deliberately, not blurred
 *    into a single reassuring percentage the original ask's "score"
 *    framing would suggest.
 *  - Risk trends, but per-INDUSTRY, not company-wide: RiskAssessment
 *    snapshots are scoped to industry (see that type's own doc
 *    comment); there is no single organization-wide or company-wide
 *    risk number anywhere in this codebase, and riskTreatmentService.ts's
 *    own doc comment explicitly warns against computing a coverage-style
 *    roll-up stat, on the grounds that doing so would smuggle
 *    Compliance's "unmapped = finding" framing back in under a new
 *    name. Surfacing industry-level trends honestly, not inventing an
 *    aggregate the codebase's own design deliberately avoided.
 *  - Business impact, narrower than "score": unresolved
 *    critical/high-severity NetworkRiskInsights -- a real, concrete
 *    count and sample, not a synthesized single number.
 *
 * Deliberately NOT computed here, and NOT faked: an overall
 * organizational risk score (no such single number exists, only
 * industry-level ones), asset health (BusinessAsset has criticality
 * and isActive, nothing resembling a health/status signal), financial
 * exposure (no dollar-value risk quantification exists anywhere --
 * Billing data here is Command Center's own subscription revenue, not
 * risk-cost modeling), and AI-generated executive summaries (no
 * internal LLM-summarization infrastructure exists; the only "AI"
 * feature in this codebase is customer-facing device support chat,
 * not reusable for this). The frontend surfaces all four as
 * explicitly "not yet available," not blank or silently omitted.
 */
import type { ComplianceRepository } from "../../Compliance/src/repository.js";
import { listFrameworks, computeFrameworkCoverage } from "../../Compliance/src/frameworkService.js";
import type { RiskIntelligenceRepository } from "../../Risk-Intelligence/src/repository.js";
import { getLatestRiskAssessment, listRiskAssessmentHistory } from "../../Risk-Intelligence/src/riskAssessmentService.js";
import { listNetworkRiskInsights } from "../../Risk-Intelligence/src/orchestrator.js";
import type { NetworkRiskInsight } from "../../Risk-Intelligence/src/types.js";
import type { ThreatIntelRepository } from "../../Threat-Intelligence/src/repository.js";
import { listVulnerabilities } from "../../Threat-Intelligence/src/vulnerabilityIngestion.js";
import { listThreatActors } from "../../Threat-Intelligence/src/threatActorIngestion.js";
import { listCampaigns } from "../../Threat-Intelligence/src/campaignIngestion.js";

export interface ThreatActivitySummary {
  activePatterns: number;
  patternsPendingVerification: number;
  criticalVulnerabilities: number;
  knownExploitedVulnerabilities: number;
  activeThreatActors: number;
  activeCampaigns: number;
}

async function getThreatActivitySummary(repo: ThreatIntelRepository): Promise<ThreatActivitySummary> {
  const [activePatterns, criticalVulns, kevVulns, actors, campaigns] = await Promise.all([
    repo.searchPatterns({ isActive: true }),
    listVulnerabilities(repo, { severity: "critical" }),
    listVulnerabilities(repo, { isKnownExploited: true }),
    listThreatActors(repo, { isActive: true }),
    listCampaigns(repo, { isActive: true }),
  ]);
  return {
    activePatterns: activePatterns.length,
    patternsPendingVerification: activePatterns.filter((p) => !p.verifiedByAnalyst && !p.isFalsePositive).length,
    criticalVulnerabilities: criticalVulns.length,
    knownExploitedVulnerabilities: kevVulns.length,
    activeThreatActors: actors.length,
    activeCampaigns: campaigns.length,
  };
}

export interface FrameworkCoverageSummary {
  frameworkKey: string;
  frameworkName: string;
  requiredControlCount: number;
  controlsWithMappedObligations: number;
  coveragePercent: number;
}

export interface ComplianceCoverageSummary {
  frameworkCount: number;
  /** Average of each framework's own coverage percent -- a real aggregate of a real metric, not a fabricated single "compliance score." Coverage means "has a mapped obligation," not "is actually satisfied" -- see this file's own top comment. */
  averageCoveragePercent: number;
  perFramework: FrameworkCoverageSummary[];
}

async function getComplianceCoverageSummary(repo: ComplianceRepository): Promise<ComplianceCoverageSummary> {
  const frameworks = await listFrameworks(repo);
  const perFramework: FrameworkCoverageSummary[] = [];
  for (const framework of frameworks) {
    const coverage = await computeFrameworkCoverage(repo, framework.key);
    const coveragePercent =
      coverage.requiredControlCount > 0 ? Math.round((coverage.controlsWithMappedObligations / coverage.requiredControlCount) * 100) : 0;
    perFramework.push({
      frameworkKey: coverage.frameworkKey,
      frameworkName: coverage.frameworkName,
      requiredControlCount: coverage.requiredControlCount,
      controlsWithMappedObligations: coverage.controlsWithMappedObligations,
      coveragePercent,
    });
  }
  const averageCoveragePercent =
    perFramework.length > 0 ? Math.round(perFramework.reduce((sum, f) => sum + f.coveragePercent, 0) / perFramework.length) : 0;
  return { frameworkCount: frameworks.length, averageCoveragePercent, perFramework };
}

export interface IndustryRiskTrendPoint {
  assessedAt: Date;
  exposureScore: number;
}

export interface IndustryRiskTrend {
  industry: string;
  latestExposureScore: number;
  latestExposureLevel: string;
  assessedAt: Date;
  /** Most recent snapshots for this industry, oldest first -- for a trend line, not just a point-in-time number. */
  history: IndustryRiskTrendPoint[];
}

/** Per-industry, not company-wide or per-organization -- see this file's own top comment for why no single aggregate number is computed here. */
async function getIndustryRiskTrends(repo: RiskIntelligenceRepository): Promise<IndustryRiskTrend[]> {
  const industries = await repo.listIndustriesWithInsights();
  const trends: IndustryRiskTrend[] = [];
  for (const industry of industries) {
    const latest = await getLatestRiskAssessment(repo, industry);
    if (!latest) continue;
    const history = await listRiskAssessmentHistory(repo, industry, { limit: 10 });
    trends.push({
      industry,
      latestExposureScore: latest.exposureScore,
      latestExposureLevel: latest.exposureLevel,
      assessedAt: latest.assessedAt,
      history: history
        .slice()
        .reverse()
        .map((h) => ({ assessedAt: h.assessedAt, exposureScore: h.exposureScore })),
    });
  }
  return trends.sort((a, b) => b.latestExposureScore - a.latestExposureScore);
}

export interface BusinessImpactSummary {
  unresolvedCriticalInsights: number;
  unresolvedHighInsights: number;
  /** A handful of the most recent unresolved critical insights, for display -- not the full list. */
  recentCriticalInsights: NetworkRiskInsight[];
}

/** Unresolved, high-severity insight counts -- a real, concrete signal, narrower than a synthesized "business impact score." See this file's own top comment. */
async function getBusinessImpactSummary(repo: RiskIntelligenceRepository): Promise<BusinessImpactSummary> {
  const [critical, high] = await Promise.all([
    listNetworkRiskInsights(repo, { isResolved: false, severity: "critical" }),
    listNetworkRiskInsights(repo, { isResolved: false, severity: "high" }),
  ]);
  return {
    unresolvedCriticalInsights: critical.length,
    unresolvedHighInsights: high.length,
    recentCriticalInsights: critical.slice(0, 5),
  };
}

export interface ExecutiveDashboardData {
  threatActivity: ThreatActivitySummary;
  complianceCoverage: ComplianceCoverageSummary;
  industryRiskTrends: IndustryRiskTrend[];
  businessImpact: BusinessImpactSummary;
  generatedAt: Date;
}

export async function getExecutiveDashboard(
  threatRepo: ThreatIntelRepository,
  complianceRepo: ComplianceRepository,
  riskRepo: RiskIntelligenceRepository,
  now: Date = new Date(),
): Promise<ExecutiveDashboardData> {
  const [threatActivity, complianceCoverage, industryRiskTrends, businessImpact] = await Promise.all([
    getThreatActivitySummary(threatRepo),
    getComplianceCoverageSummary(complianceRepo),
    getIndustryRiskTrends(riskRepo),
    getBusinessImpactSummary(riskRepo),
  ]);
  return { threatActivity, complianceCoverage, industryRiskTrends, businessImpact, generatedAt: now };
}
