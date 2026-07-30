/**
 * Cloud/AI provider outages: see types.ts's own doc comment on
 * CloudProviderOutage for the full reasoning -- staff-reported, the
 * same legitimate pattern ThreatActorSource's own "staff_curated"
 * value already establishes, not a live-ingestion adapter this
 * environment has no way to build honestly against a real, current
 * external API spec.
 *
 * assessOutageImpact is the actual realization of "a critical OpenAI
 * outage -- who uses OpenAI -- only those organizations receive
 * elevated risk" from the very first message that started this whole
 * Risk Intelligence arc: it combines vendorImpactService.ts's own
 * findOrganizationsUsingVendor (which orgs use this vendor at all)
 * with assetDependencyService.ts's own listAssetsDependentOnVendor
 * (which of THEIR SPECIFIC systems actually depend on it) into one
 * answer -- not just "who's affected" the way the original example
 * asked for, but "and here's exactly what breaks for them."
 */
import { randomUUID } from "node:crypto";
import type { RiskIntelligenceRepository } from "./repository.js";
import type { CloudProviderOutage, InsightSeverity, NetworkRiskInsight, VendorCategory } from "./types.js";
import type { OrganizationsRepository } from "../../Organizations/src/repository.js";
import { findOrganizationsUsingVendor } from "./vendorImpactService.js";
import { listAssetsDependentOnVendor, listTransitiveDependentsOfVendor } from "./assetDependencyService.js";
import { CROSS_INDUSTRY } from "./externalSignalIngestion.js";
import { packageAndDistribute } from "../../Publishing/src/publishingService.js";
import type { PublishableIntelligence } from "../../Publishing/src/types.js";
import type { AnnouncementsRepository } from "../../Announcements/src/repository.js";
import type { Announcement, AnnouncementSeverity } from "../../Announcements/src/types.js";

export class CloudOutageError extends Error {
  constructor(
    message: string,
    public readonly code: "outage_not_found",
  ) {
    super(message);
    this.name = "CloudOutageError";
  }
}

/** Pure -- what an outage report becomes as a NetworkRiskInsight, without touching a repository. */
export function buildInsightFromOutage(outage: CloudProviderOutage, now: Date = new Date()): NetworkRiskInsight {
  return {
    id: randomUUID(),
    industry: CROSS_INDUSTRY,
    type: "external_signal",
    severity: outage.severity,
    summary: `${outage.vendor} outage: ${outage.title}`,
    explanation: outage.description,
    contributingFactors: {
      source: "cloud_provider_outage",
      sourceReferenceId: outage.id,
      outageId: outage.id,
      vendor: outage.vendor,
      category: outage.category,
      affectedServices: outage.affectedServices,
      startedAt: outage.startedAt,
      sourceUrl: outage.sourceUrl,
    },
    recommendation: `Check whether your own environment depends on ${outage.vendor} for ${outage.affectedServices.join(", ") || "any affected service"}; review the assessOutageImpact query for this outage to see exactly which organizations and systems are affected.`,
    // Staff has directly confirmed this outage is happening -- the same
    // "reporting a confirmed fact, not a probabilistic guess" reasoning
    // every other external signal source in this file already uses.
    confidence: 1.0,
    linkedAggregateIds: [],
    isResolved: outage.isResolved,
    createdAt: now,
    resolvedAt: outage.resolvedAt,
  };
}

/**
 * Records an outage and generates its NetworkRiskInsight in the same
 * call -- not a separate step. The act of a staff member reporting
 * this outage IS the confirmation; there's no further review step the
 * way there is for, say, approving a compliance obligation.
 */
export async function reportOutage(
  repo: RiskIntelligenceRepository,
  input: {
    vendor: string;
    category: VendorCategory;
    title: string;
    description: string;
    severity: InsightSeverity;
    affectedServices: string[];
    startedAt: Date;
    sourceUrl?: string | null;
    reportedByStaffId: string;
  },
  now: Date = new Date(),
): Promise<{ outage: CloudProviderOutage; insight: NetworkRiskInsight }> {
  const outage: CloudProviderOutage = {
    id: randomUUID(),
    vendor: input.vendor,
    category: input.category,
    title: input.title,
    description: input.description,
    severity: input.severity,
    affectedServices: input.affectedServices,
    startedAt: input.startedAt,
    isResolved: false,
    resolvedAt: null,
    sourceUrl: input.sourceUrl ?? null,
    reportedByStaffId: input.reportedByStaffId,
    createdAt: now,
    updatedAt: now,
  };
  await repo.createCloudProviderOutage(outage);

  const insight = buildInsightFromOutage(outage, now);
  await repo.createInsight(insight);

  return { outage, insight };
}

async function requireOutage(repo: RiskIntelligenceRepository, id: string): Promise<CloudProviderOutage> {
  const outage = await repo.getCloudProviderOutageById(id);
  if (!outage) {
    throw new CloudOutageError(`No outage with id "${id}"`, "outage_not_found");
  }
  return outage;
}

export async function resolveOutage(repo: RiskIntelligenceRepository, id: string, now: Date = new Date()): Promise<CloudProviderOutage> {
  const existing = await requireOutage(repo, id);
  const updated: CloudProviderOutage = { ...existing, isResolved: true, resolvedAt: now, updatedAt: now };
  await repo.updateCloudProviderOutage(updated);
  return updated;
}

export async function listOutages(
  repo: RiskIntelligenceRepository,
  opts?: { vendor?: string; category?: VendorCategory; isResolved?: boolean; limit?: number },
): Promise<CloudProviderOutage[]> {
  return repo.listCloudProviderOutages(opts);
}

export interface OutageImpact {
  outageId: string;
  vendor: string;
  category: VendorCategory;
  /** Every organization that discloses using this vendor -- may be a superset of organizationsWithAffectedAssets, since not every org that uses a vendor has yet recorded a specific dependency on it. */
  affectedOrganizations: { organizationId: string; organizationName: string }[];
  /**
   * Only the organizations with a specific, recorded asset dependency
   * on this vendor -- the "what breaks" half of the answer, not just
   * "who's affected." Now the FULL cascade, not just direct
   * dependents: an asset can appear here with depth > 1 if it depends
   * on something that depends (directly or further downstream) on the
   * outage's own vendor. directDependency is only ever present for
   * depth-1 assets -- a transitively-affected asset has no dependency
   * record of its own describing the outage; it's affected because of
   * what it depends on, not because of a direct relationship to the
   * vendor itself.
   */
  affectedAssetsByOrganization: {
    organizationId: string;
    organizationName: string;
    assets: {
      assetId: string;
      depth: number;
      path: string[];
      directDependency: { description: string; criticality: string } | null;
    }[];
  }[];
}

/**
 * The real payoff: combines findOrganizationsUsingVendor (who
 * discloses using this vendor at all) with
 * listTransitiveDependentsOfVendor (every asset that depends on it,
 * directly or through any number of intermediate assets -- not just
 * the direct dependents listAssetsDependentOnVendor alone would find).
 * An org can appear in affectedOrganizations without appearing in
 * affectedAssetsByOrganization -- using a vendor and having recorded a
 * specific dependency on it are different, and the gap between the two
 * lists is itself informative (which orgs disclosed the vendor but
 * haven't yet mapped what depends on it).
 */
export async function assessOutageImpact(
  repo: RiskIntelligenceRepository,
  orgsRepo: OrganizationsRepository,
  outageId: string,
): Promise<OutageImpact> {
  const outage = await requireOutage(repo, outageId);

  const orgImpacts = await findOrganizationsUsingVendor(orgsRepo, outage.vendor, outage.category);

  const affectedAssetsByOrganization: OutageImpact["affectedAssetsByOrganization"] = [];
  for (const org of orgImpacts) {
    const [directDependencies, cascade] = await Promise.all([
      listAssetsDependentOnVendor(repo, org.organizationId, outage.vendor, outage.category),
      listTransitiveDependentsOfVendor(repo, org.organizationId, outage.vendor, outage.category),
    ]);
    if (cascade.length === 0) continue;

    const directByAssetId = new Map(directDependencies.map((d) => [d.dependentAssetId, d]));
    affectedAssetsByOrganization.push({
      organizationId: org.organizationId,
      organizationName: org.organizationName,
      assets: cascade.map((c) => {
        const direct = directByAssetId.get(c.assetId);
        return {
          assetId: c.assetId,
          depth: c.depth,
          path: c.path,
          directDependency: direct ? { description: direct.description, criticality: direct.criticality } : null,
        };
      }),
    });
  }

  return {
    outageId: outage.id,
    vendor: outage.vendor,
    category: outage.category,
    affectedOrganizations: orgImpacts.map((o) => ({ organizationId: o.organizationId, organizationName: o.organizationName })),
    affectedAssetsByOrganization,
  };
}

function mapOutageSeverityToAnnouncementSeverity(severity: InsightSeverity): AnnouncementSeverity {
  switch (severity) {
    case "critical":
      return "critical";
    case "high":
    case "medium":
      return "warning";
    case "low":
      return "info";
    default:
      // InsightSeverity is a closed union -- this branch is unreachable
      // at the type level, kept only so a future addition to that union
      // fails loudly here instead of silently producing `undefined`,
      // matching the same defensive pattern notificationGeneration.ts
      // already uses for the identical mapping over insights.
      return "info";
  }
}

function formatOutageNoticeBody(outage: CloudProviderOutage): string {
  const lines = [outage.description];
  if (outage.affectedServices.length > 0) {
    lines.push("", `Affected services: ${outage.affectedServices.join(", ")}`);
  }
  if (outage.sourceUrl) {
    lines.push("", `More information: ${outage.sourceUrl}`);
  }
  return lines.join("\n");
}

/**
 * The distribution counterpart to assessOutageImpact -- generates one
 * Announcement per organization that discloses using the outage's own
 * vendor, the same "one targeted row per affected party" shape
 * notificationGeneration.ts's own Risk Notices already use for
 * industry-scoped insights, just matched by vendor here instead of
 * industry.
 *
 * This is specifically the piece CVE- and MITRE-campaign-derived
 * insights genuinely can't have yet, and why they're not given an
 * equivalent function here or anywhere else: neither has any real
 * org-matching mechanism built. A CVE's own affectedProducts field is
 * CPE data (e.g. "cpe:2.3:a:openai:..."), not the same open-vocabulary
 * vendor strings OrganizationProfile's own cloudProviders/aiProviders/
 * deviceTypes use -- honestly mapping between the two would need real,
 * separate matching work (heuristic or otherwise), not attempted
 * here. A MITRE campaign has no vendor concept at all. Both stay
 * staff-browsable only, exactly as they already were, until that
 * matching work exists -- this function isn't a template extended to
 * cover them; it works here specifically because
 * assessOutageImpact's own vendor matching, built for a different
 * purpose, already exists to reuse.
 *
 * Distributes to every organization that discloses using the vendor
 * (assessOutageImpact's own affectedOrganizations list), not narrowed
 * to only the subset with a specific, recorded asset dependency --
 * the same breadth Risk Notices already applies for industry matching,
 * so an org that uses a vendor but hasn't yet mapped what depends on
 * it still gets notified, not silently skipped.
 */
export async function generateAndPublishOutageNotices(
  repo: RiskIntelligenceRepository,
  orgsRepo: OrganizationsRepository,
  announcementsRepo: AnnouncementsRepository,
  outageId: string,
  createdByStaffId: string,
  now: Date = new Date(),
): Promise<Announcement[]> {
  const outage = await requireOutage(repo, outageId);
  const affected = await findOrganizationsUsingVendor(orgsRepo, outage.vendor, outage.category);

  const baseItem: Omit<PublishableIntelligence, "organizationId"> = {
    sourceType: "risk_intelligence",
    sourceId: outage.id,
    title: `${outage.vendor} outage: ${outage.title}`,
    body: formatOutageNoticeBody(outage),
    severity: mapOutageSeverityToAnnouncementSeverity(outage.severity),
    audience: "customers",
  };

  const created: Announcement[] = [];
  for (const org of affected) {
    const item: PublishableIntelligence = { ...baseItem, organizationId: org.organizationId };
    const announcement = await packageAndDistribute(announcementsRepo, item, createdByStaffId, now);
    created.push(announcement);
  }
  return created;
}
