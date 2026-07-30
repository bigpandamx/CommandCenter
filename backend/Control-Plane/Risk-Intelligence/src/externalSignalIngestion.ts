/**
 * External Signal Ingestion: the first, proof-of-pattern piece of
 * wiring signal sources that already exist elsewhere in this codebase
 * into Risk Intelligence's own detection layer -- see types.ts's own
 * doc comment on InsightType/DetectorGeneratedInsightType for why this
 * needed a new insight type rather than reusing one of the four
 * detector-computed ones.
 *
 * Scoped to CVEs (NVD's own vulnerability data, already ingested by
 * Threat-Intelligence's vulnerabilityIngestion.ts) in this round.
 * Threat intelligence (MITRE ATT&CK: threat actors, campaigns,
 * techniques) and compliance changes are real, separate, structurally
 * identical extensions of this exact pattern -- each would need its
 * own "what makes this significant" judgment and its own
 * buildInsightFrom* function, the same shape as buildInsightFromVulnerability
 * below -- not attempted here, a stated scope boundary, not an
 * oversight.
 *
 * Eligibility is deliberately narrow and deliberately NOT tunable via
 * Risk Models: a vulnerability becomes an insight only if it's
 * critical CVSS severity or CISA KEV-listed (known exploited in the
 * wild) -- both already classified by the source itself (NVD, CISA),
 * not a threshold Command Center computes or has any business
 * second-guessing. confidence is set to 1.0 for every insight this
 * produces, for the same reason -- there's no probabilistic detection
 * happening here, only a pass-through of an external authority's own
 * classification.
 *
 * industry is set to the CROSS_INDUSTRY sentinel, not left to guess or
 * made nullable -- a CVE isn't inherently industry-scoped the way an
 * aggregated cross-org signal is (NetworkRiskInsight.industry couldn't
 * honestly carry anything more specific here), and changing that field
 * to nullable would ripple through Risk Notices' own industry
 * matching, Risk Assessments' per-industry snapshots, and Organization
 * Impact -- a much larger, separate change this round doesn't attempt.
 * A real, practical consequence worth stating plainly: these insights
 * won't be picked up by Risk Notices' existing industry-based
 * distribution, since no organization's own profile.industry will ever
 * equal "cross-industry" -- they're reachable through staff browsing
 * and Risk Factor classification, not (yet) through automatic
 * customer-facing distribution.
 * A real correctness fix applied here, not just to the new campaign
 * path below: the original CVE ingestion relied only on a global
 * cursor (getMostRecentExternalSignalInsightCreatedAt) for dedup. That
 * cursor alone isn't sufficient -- NVD can touch a CVE's own
 * lastModifiedAt without its severity classification changing (e.g.
 * adding a reference URL), which would have re-matched and
 * re-generated an insight for the same already-reported CVE. Both
 * signal sources now use hasExternalSignalInsightForSource as the
 * actual, authoritative per-entity guard; the cursor remains as a
 * genuine optimization (narrowing what gets queried from the source
 * repository at all), not the correctness mechanism.
 */
import { randomUUID } from "node:crypto";
import type { RiskIntelligenceRepository } from "./repository.js";
import type { InsightSeverity, NetworkRiskInsight } from "./types.js";
import type { ThreatIntelRepository } from "../../Threat-Intelligence/src/repository.js";
import type { Campaign, Vulnerability } from "../../Threat-Intelligence/src/types.js";
import type { ComplianceRepository } from "../../Compliance/src/repository.js";
import type { ComplianceObligation } from "../../Compliance/src/types.js";

export const CROSS_INDUSTRY = "cross-industry";

function isSignificantVulnerability(vuln: Vulnerability): boolean {
  return vuln.isKnownExploited || vuln.cvssBaseSeverity === "critical";
}

/** Pure -- the eligibility check and insight construction, without touching a repository. */
export function buildInsightFromVulnerability(vuln: Vulnerability, now: Date = new Date()): NetworkRiskInsight | null {
  if (!isSignificantVulnerability(vuln)) return null;

  const severity: InsightSeverity = vuln.isKnownExploited || vuln.cvssBaseSeverity === "critical" ? "critical" : "high";

  const summary = vuln.isKnownExploited
    ? `${vuln.cveId}: known-exploited vulnerability (CISA KEV)`
    : `${vuln.cveId}: critical severity vulnerability`;

  const recommendation = vuln.isKnownExploited
    ? `Listed in CISA's Known Exploited Vulnerabilities catalog${vuln.kevDueDate ? ` (federal remediation deadline ${vuln.kevDueDate.toISOString().slice(0, 10)})` : ""}. Review affected products against your own environment and remediate immediately.`
    : `NVD-rated critical severity (CVSS ${vuln.cvssBaseScore ?? "unknown"}). Review affected products against your own environment and apply available patches.`;

  return {
    id: randomUUID(),
    industry: CROSS_INDUSTRY,
    type: "external_signal",
    severity,
    summary,
    explanation: vuln.description,
    contributingFactors: {
      source: "nvd_cve",
      sourceReferenceId: vuln.cveId,
      cveId: vuln.cveId,
      cvssBaseScore: vuln.cvssBaseScore,
      cvssBaseSeverity: vuln.cvssBaseSeverity,
      isKnownExploited: vuln.isKnownExploited,
      affectedProducts: vuln.affectedProducts,
    },
    recommendation,
    // Not a probabilistic detection -- a pass-through of NVD/CISA's own
    // existing classification, so confidence is always full.
    confidence: 1.0,
    linkedAggregateIds: [],
    isResolved: false,
    createdAt: now,
    resolvedAt: null,
  };
}

/**
 * Fetches every significant vulnerability modified since Risk
 * Intelligence's own last-processed cursor (an optimization, narrowing
 * what gets queried at all), converts each to an insight, and
 * persists it -- but only if hasExternalSignalInsightForSource
 * confirms this specific CVE hasn't already been reported. That
 * per-entity check is the actual correctness guard; the cursor alone
 * isn't sufficient, since NVD can touch a CVE's lastModifiedAt without
 * its severity classification changing. One vulnerability's failure
 * doesn't stop the rest -- the same resilience pattern used everywhere
 * else a batch of independent items gets processed in this codebase.
 *
 * Two separate, server-side-filtered queries (critical severity;
 * known-exploited) rather than fetching everything and filtering in
 * memory, since VulnerabilitySearchQuery doesn't support an OR
 * condition across severity and isKnownExploited -- de-duplicated by
 * cveId afterward, since a KEV-listed critical CVE would otherwise
 * appear in both result sets.
 */
export async function generateInsightsFromVulnerabilities(
  threatIntelRepo: ThreatIntelRepository,
  riskIntelRepo: RiskIntelligenceRepository,
  now: Date = new Date(),
): Promise<{ created: NetworkRiskInsight[]; failed: { cveId: string; error: string }[] }> {
  const cursor = await riskIntelRepo.getMostRecentExternalSignalInsightCreatedAt();

  const [criticalVulns, kevVulns] = await Promise.all([
    threatIntelRepo.searchVulnerabilities({ severity: "critical", lastModifiedSince: cursor ?? undefined }),
    threatIntelRepo.searchVulnerabilities({ isKnownExploited: true, lastModifiedSince: cursor ?? undefined }),
  ]);

  const seenCveIds = new Set<string>();
  const significant = [...criticalVulns, ...kevVulns].filter((vuln) => {
    if (seenCveIds.has(vuln.cveId)) return false;
    seenCveIds.add(vuln.cveId);
    return true;
  });

  const created: NetworkRiskInsight[] = [];
  const failed: { cveId: string; error: string }[] = [];
  for (const vuln of significant) {
    try {
      const insight = buildInsightFromVulnerability(vuln, now);
      if (!insight) continue; // shouldn't happen given the queries above, but buildInsightFromVulnerability's own eligibility check is the single source of truth
      const alreadyReported = await riskIntelRepo.hasExternalSignalInsightForSource("nvd_cve", vuln.cveId);
      if (alreadyReported) continue;
      await riskIntelRepo.createInsight(insight);
      created.push(insight);
    } catch (err) {
      failed.push({ cveId: vuln.cveId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { created, failed };
}

function isSignificantCampaign(campaign: Campaign): boolean {
  return campaign.isActive;
}

/**
 * Pure -- the eligibility check and insight construction for a MITRE
 * ATT&CK campaign, the second real signal source wired in. Unlike a
 * CVE, MITRE provides no equivalent to a CVSS score for a campaign --
 * severity is a deliberate, stated, uniform "high" for every eligible
 * campaign, not derived from anything, since there's no real signal
 * here to derive it from. confidence stays 1.0 for a different reason
 * than the CVE case: this reports Command Center's own current,
 * confirmed record of the campaign's active status (whether
 * MITRE-derived or staff-confirmed), not a probabilistic guess about
 * it -- the same "pass-through of a confirmed fact" reasoning, applied
 * to our own data instead of an external CVSS score.
 */
export function buildInsightFromCampaign(campaign: Campaign, now: Date = new Date()): NetworkRiskInsight | null {
  if (!isSignificantCampaign(campaign)) return null;

  const isAttributed = campaign.attributedActorIds !== null && campaign.attributedActorIds.length > 0;
  const attributionNote = isAttributed
    ? ` Attributed to ${campaign.attributedActorIds!.length} known threat actor(s).`
    : " Not yet attributed to a known threat actor.";

  // A campaign not yet ingested from MITRE (mitreCampaignId null, staff-curated)
  // still needs a stable sourceReferenceId for dedup -- falls back to the
  // campaign's own local id in that case.
  const sourceReferenceId = campaign.mitreCampaignId ?? campaign.id;

  return {
    id: randomUUID(),
    industry: CROSS_INDUSTRY,
    type: "external_signal",
    severity: "high",
    summary: `Active threat campaign: ${campaign.name}`,
    explanation: campaign.description + attributionNote,
    contributingFactors: {
      source: "mitre_attack_campaign",
      sourceReferenceId,
      mitreCampaignId: campaign.mitreCampaignId,
      campaignId: campaign.id,
      attributedActorIds: campaign.attributedActorIds,
      firstSeen: campaign.firstSeen,
      lastSeen: campaign.lastSeen,
    },
    recommendation: "Review whether your own environment intersects with this campaign's known techniques and targets.",
    confidence: 1.0,
    linkedAggregateIds: [],
    isResolved: false,
    createdAt: now,
    resolvedAt: null,
  };
}

/**
 * Fetches every active campaign updated since Risk Intelligence's own
 * cursor, converts each to an insight, but only if
 * hasExternalSignalInsightForSource confirms this specific campaign
 * hasn't already been reported. That per-entity check is NOT optional
 * here the way it's a belt-and-suspenders correctness fix for CVEs --
 * campaignIngestion.ts's own upsert unconditionally bumps updatedAt on
 * every re-sync, even with no meaningful change, so a cursor-only
 * approach would re-generate an insight for the same still-active
 * campaign on every single run without this guard.
 */
export async function generateInsightsFromCampaigns(
  threatIntelRepo: ThreatIntelRepository,
  riskIntelRepo: RiskIntelligenceRepository,
  now: Date = new Date(),
): Promise<{ created: NetworkRiskInsight[]; failed: { campaignId: string; error: string }[] }> {
  const cursor = await riskIntelRepo.getMostRecentExternalSignalInsightCreatedAt();
  const activeCampaigns = await threatIntelRepo.searchCampaigns({ isActive: true, updatedSince: cursor ?? undefined });

  const created: NetworkRiskInsight[] = [];
  const failed: { campaignId: string; error: string }[] = [];
  for (const campaign of activeCampaigns) {
    try {
      const insight = buildInsightFromCampaign(campaign, now);
      if (!insight) continue;
      const sourceReferenceId = campaign.mitreCampaignId ?? campaign.id;
      const alreadyReported = await riskIntelRepo.hasExternalSignalInsightForSource("mitre_attack_campaign", sourceReferenceId);
      if (alreadyReported) continue;
      await riskIntelRepo.createInsight(insight);
      created.push(insight);
    } catch (err) {
      failed.push({ campaignId: campaign.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { created, failed };
}

/** How close a deadline needs to be for the obligation to be insight-worthy at all -- a near-term compliance deadline is genuinely actionable now, the same "demands attention" bar CVE's own critical/KEV eligibility sets, not an arbitrary number. */
const DEADLINE_WINDOW_DAYS = 90;
/** Within this many days, severity is "critical" rather than "high" -- the same two-tier urgency shape a CVE's own known-exploited-vs-critical split already uses. */
const CRITICAL_DEADLINE_WINDOW_DAYS = 30;

function daysUntil(date: Date, now: Date): number {
  return (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
}

function isSignificantObligation(obligation: ComplianceObligation, now: Date): boolean {
  if (obligation.status !== "approved") return false;
  if (!obligation.deadlineDate) return false;
  const days = daysUntil(obligation.deadlineDate, now);
  return days >= 0 && days <= DEADLINE_WINDOW_DAYS;
}

/**
 * Pure -- the eligibility check and insight construction for a
 * compliance obligation, the third signal source wired in. Unlike a
 * CVE or a MITRE campaign, an obligation carries REAL industry data
 * (ComplianceObligation.industries) -- a genuine improvement over the
 * cross-industry sentinel those two sources were stuck with, not an
 * afterthought: it means these insights, unlike CVE/campaign-derived
 * ones, CAN reach Risk Notices' existing industry-based distribution.
 * Produces one insight PER industry the obligation applies to (a real
 * fan-out, not a single insight arbitrarily assigned to one industry),
 * falling back to the CROSS_INDUSTRY sentinel only when
 * industries is genuinely empty (undetermined).
 *
 * Eligibility gates on status "approved" -- STAFF has already reviewed
 * and confirmed this obligation is real and applicable, the same
 * "an authority already classified this" pattern CVE's NVD/CISA
 * classification and campaign's isActive both already established,
 * just with Command Center's own staff as the authority this time.
 * confidence is 1.0 for the same reason: by the time an obligation is
 * approved, the original AI extraction confidence (still recorded in
 * contributingFactors for traceability) has been superseded by a
 * human confirmation.
 *
 * sourceReferenceId is always `${obligationId}:${industry}`, even in
 * the single-industry or cross-industry case -- NOT conditionally
 * formatted based on how many industries there are. A conditional
 * format would let the dedup key silently shift if an obligation's
 * own industries array is ever revised between runs, which is exactly
 * the class of bug the per-entity dedup guard exists to prevent
 * elsewhere in this file.
 */
export function buildInsightsFromObligation(
  obligation: ComplianceObligation,
  parentUpdateTitle: string,
  now: Date = new Date(),
): NetworkRiskInsight[] {
  if (!isSignificantObligation(obligation, now)) return [];

  const severity: InsightSeverity = daysUntil(obligation.deadlineDate!, now) <= CRITICAL_DEADLINE_WINDOW_DAYS ? "critical" : "high";
  const industries = obligation.industries.length > 0 ? obligation.industries : [CROSS_INDUSTRY];
  const deadlineIso = obligation.deadlineDate!.toISOString().slice(0, 10);

  return industries.map((industry) => ({
    id: randomUUID(),
    industry,
    type: "external_signal",
    severity,
    summary: `Compliance deadline approaching (${deadlineIso}): ${parentUpdateTitle}`,
    explanation: obligation.description,
    contributingFactors: {
      source: "compliance_obligation",
      sourceReferenceId: `${obligation.id}:${industry}`,
      obligationId: obligation.id,
      updateId: obligation.updateId,
      obligationType: obligation.obligationType,
      deadlineDate: obligation.deadlineDate,
      deadlineDescription: obligation.deadlineDescription,
      originalExtractionConfidence: obligation.confidence,
    },
    recommendation: `Review this obligation ahead of its ${deadlineIso} deadline (${obligation.deadlineDescription ?? "see full obligation for timing details"}) and confirm your own compliance posture.`,
    // Staff has already reviewed and approved this obligation -- a human
    // confirmation supersedes the original AI extraction confidence.
    confidence: 1.0,
    linkedAggregateIds: [],
    isResolved: false,
    createdAt: now,
    resolvedAt: null,
  }));
}

/**
 * Fetches every approved obligation with a deadline in the next
 * DEADLINE_WINDOW_DAYS, converts each to one insight per applicable
 * industry, but only creates an insight if
 * hasExternalSignalInsightForSource confirms this specific
 * obligation/industry pair hasn't already been reported -- the same
 * per-entity guard the other two signal sources rely on, needed here
 * too since re-running this job as the deadline gets closer would
 * otherwise re-surface the same obligation repeatedly.
 *
 * listUpcomingObligations doesn't filter by review status or exclude
 * already-past deadlines on its own (see its own implementation) --
 * both are filtered here, in isSignificantObligation, not pushed onto
 * the repository query.
 */
export async function generateInsightsFromComplianceObligations(
  complianceRepo: ComplianceRepository,
  riskIntelRepo: RiskIntelligenceRepository,
  now: Date = new Date(),
): Promise<{ created: NetworkRiskInsight[]; failed: { obligationId: string; error: string }[] }> {
  const windowEnd = new Date(now.getTime() + DEADLINE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const upcoming = await complianceRepo.listUpcomingObligations(windowEnd);
  const eligible = upcoming.filter((o) => isSignificantObligation(o, now));

  const created: NetworkRiskInsight[] = [];
  const failed: { obligationId: string; error: string }[] = [];
  for (const obligation of eligible) {
    try {
      const parentUpdate = await complianceRepo.getUpdateById(obligation.updateId);
      const parentUpdateTitle = parentUpdate?.title ?? "(source document unavailable)";
      const insights = buildInsightsFromObligation(obligation, parentUpdateTitle, now);
      for (const insight of insights) {
        const sourceReferenceId = (insight.contributingFactors as { sourceReferenceId: string }).sourceReferenceId;
        const alreadyReported = await riskIntelRepo.hasExternalSignalInsightForSource("compliance_obligation", sourceReferenceId);
        if (alreadyReported) continue;
        await riskIntelRepo.createInsight(insight);
        created.push(insight);
      }
    } catch (err) {
      failed.push({ obligationId: obligation.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { created, failed };
}
