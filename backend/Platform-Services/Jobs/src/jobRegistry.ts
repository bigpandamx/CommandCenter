import { runComplianceIngestionForSource } from "../../../Control-Plane/Compliance/src/scheduler.js";
import { analyzeUnanalyzedUpdates } from "../../../Control-Plane/Compliance/src/analysisService.js";
import type { ComplianceRepository } from "../../../Control-Plane/Compliance/src/repository.js";
import { publishDueScheduledAnnouncements } from "../../../Control-Plane/Announcements/src/announcementService.js";
import type { AnnouncementsRepository } from "../../../Control-Plane/Announcements/src/repository.js";
import { cleanupExpiredData } from "../../../Control-Plane/Threat-Intelligence/src/retentionCleanup.js";
import { computeSyncWindow, ingestVulnerabilities } from "../../../Control-Plane/Threat-Intelligence/src/vulnerabilityIngestion.js";
import { fetchNvdVulnerabilities } from "../../../Control-Plane/Threat-Intelligence/src/nvdAdapter.js";
import { ingestThreatActors } from "../../../Control-Plane/Threat-Intelligence/src/threatActorIngestion.js";
import { ingestCampaigns } from "../../../Control-Plane/Threat-Intelligence/src/campaignIngestion.js";
import { ingestTechniques } from "../../../Control-Plane/Threat-Intelligence/src/techniqueIngestion.js";
import { ingestMalware } from "../../../Control-Plane/Threat-Intelligence/src/malwareIngestion.js";
import { fetchMitreThreatActors, fetchMitreCampaigns, fetchMitreTechniques, fetchMitreMalware } from "../../../Control-Plane/Threat-Intelligence/src/mitreAttackAdapter.js";
import type { ThreatIntelRepository } from "../../../Control-Plane/Threat-Intelligence/src/repository.js";
import { generateRiskAssessmentSnapshotsForAllIndustries } from "../../../Control-Plane/Risk-Intelligence/src/riskAssessmentService.js";
import { generateInsightsFromVulnerabilities, generateInsightsFromCampaigns, generateInsightsFromComplianceObligations } from "../../../Control-Plane/Risk-Intelligence/src/externalSignalIngestion.js";
import type { RiskIntelligenceRepository } from "../../../Control-Plane/Risk-Intelligence/src/repository.js";
import type { AIProvider } from "../../../Customer-Connections/AIChat/src/aiProvider.js";
import type { JobDefinition } from "./types.js";

const COMPLIANCE_ANALYSIS_BATCH_LIMIT = 20;

/**
 * The small, fixed set of STATIC jobs -- one entry per real, existing
 * function, wrapped only enough to produce a JobDefinition's own
 * `run(now) => { summary }` shape. None of the underlying functions
 * changed to accommodate this; Jobs adapts to them, not the reverse.
 *
 * aiProvider is nullable because Compliance Analysis genuinely can't
 * run without one -- same "AI optional, the feature is just absent
 * without a key" pattern this codebase already uses everywhere else
 * an AIProvider is threaded through (see server.ts's own AI-provider
 * conditional block). When null, Compliance Analysis is simply not
 * registered at all, not registered-but-broken.
 */
export function buildStaticJobDefinitions(
  complianceRepo: ComplianceRepository,
  announcementsRepo: AnnouncementsRepository,
  threatIntelRepo: ThreatIntelRepository,
  riskIntelRepo: RiskIntelligenceRepository,
  aiProvider: AIProvider | null,
  nvdApiKey: string | null,
): JobDefinition[] {
  const definitions: JobDefinition[] = [
    {
      key: "announcement-publishing",
      name: "Announcement Publishing",
      description: "Publishes draft announcements whose scheduled publish time has arrived.",
      category: "publishing",
      run: async (now) => {
        const results = await publishDueScheduledAnnouncements(announcementsRepo, now);
        const failed = results.filter((r) => r.status === "error").length;
        return { summary: `${results.length} due, ${results.length - failed} published, ${failed} failed` };
      },
    },
    {
      key: "threat-intel-retention-cleanup",
      name: "Threat Intel Retention Cleanup",
      description: "Deletes expired risk-signal aggregates and soft-deletes expired data-sharing logs.",
      category: "cleanup",
      run: async (now) => {
        const result = await cleanupExpiredData(threatIntelRepo, now);
        if (!result.success) {
          throw new Error(result.error ?? "cleanup failed for an unknown reason");
        }
        return { summary: `${result.aggregatesDeleted} aggregates deleted, ${result.sharingLogsSoftDeleted} sharing logs soft-deleted` };
      },
    },
    {
      key: "vulnerability-sync",
      name: "Vulnerability Sync (NVD)",
      description: "Pulls new and recently-modified CVE records from NVD's CVE API 2.0, incrementally.",
      category: "ingestion",
      run: async (now) => {
        const window = await computeSyncWindow(threatIntelRepo, now);
        const vulnerabilities = await fetchNvdVulnerabilities(window.since, window.until, nvdApiKey ?? undefined);
        const result = await ingestVulnerabilities(threatIntelRepo, vulnerabilities, now);
        return { summary: `${result.inserted} inserted, ${result.updated} updated, ${result.failed} failed` };
      },
    },
    {
      key: "threat-actor-sync",
      name: "Threat Actor Sync (MITRE ATT&CK)",
      description: "Refreshes the full MITRE ATT&CK Groups list -- there's no incremental feed, so this re-fetches and re-filters the whole bundle each run.",
      category: "ingestion",
      run: async (now) => {
        const actors = await fetchMitreThreatActors();
        const result = await ingestThreatActors(threatIntelRepo, actors, now);
        return { summary: `${result.inserted} inserted, ${result.updated} updated, ${result.failed} failed` };
      },
    },
    {
      key: "campaign-sync",
      name: "Campaign Sync (MITRE ATT&CK)",
      description: "Refreshes the full MITRE ATT&CK Campaigns list, including attributed-to resolution against Groups -- same whole-bundle-refresh shape as Threat Actor Sync, since MITRE has no incremental feed.",
      category: "ingestion",
      run: async (now) => {
        const campaigns = await fetchMitreCampaigns();
        const result = await ingestCampaigns(threatIntelRepo, campaigns, now);
        return { summary: `${result.inserted} inserted, ${result.updated} updated, ${result.failed} failed` };
      },
    },
    {
      key: "technique-sync",
      name: "Technique Sync (MITRE ATT&CK)",
      description: "Refreshes the full MITRE ATT&CK Techniques list, including sub-technique parentage and usage resolution against Groups and Campaigns -- same whole-bundle-refresh shape as Campaign Sync, since MITRE has no incremental feed.",
      category: "ingestion",
      run: async (now) => {
        const techniques = await fetchMitreTechniques();
        const result = await ingestTechniques(threatIntelRepo, techniques, now);
        return { summary: `${result.inserted} inserted, ${result.updated} updated, ${result.failed} failed` };
      },
    },
    {
      key: "malware-sync",
      name: "Malware Sync (MITRE ATT&CK)",
      description: "Refreshes the full MITRE ATT&CK Software list (malware + tool STIX types), including three-way usage resolution against Groups, Campaigns, and Techniques -- same whole-bundle-refresh shape as Technique Sync, since MITRE has no incremental feed.",
      category: "ingestion",
      run: async (now) => {
        const malware = await fetchMitreMalware();
        const result = await ingestMalware(threatIntelRepo, malware, now);
        return { summary: `${result.inserted} inserted, ${result.updated} updated, ${result.failed} failed` };
      },
    },
    {
      key: "risk-assessment-snapshot",
      name: "Risk Assessment Snapshot",
      description: "Records a fresh exposure snapshot for every industry that has ever had a risk insight, enabling trend tracking over time.",
      category: "analysis",
      run: async (now) => {
        const results = await generateRiskAssessmentSnapshotsForAllIndustries(riskIntelRepo, now);
        const failed = results.filter((r) => r.status === "error").length;
        return { summary: `${results.length} industries snapshotted, ${failed} failed` };
      },
    },
    {
      key: "external-signal-ingestion-cve",
      name: "External Signal Ingestion (CVE)",
      description: "Converts critical or CISA-KEV-listed vulnerabilities, already ingested from NVD, into risk insights -- the first of several planned signal sources wired into Risk Intelligence's own detection layer.",
      category: "analysis",
      run: async (now) => {
        const { created, failed } = await generateInsightsFromVulnerabilities(threatIntelRepo, riskIntelRepo, now);
        return { summary: `${created.length} insights created, ${failed.length} failed` };
      },
    },
    {
      key: "external-signal-ingestion-mitre-campaign",
      name: "External Signal Ingestion (MITRE ATT&CK Campaigns)",
      description: "Converts active MITRE ATT&CK campaigns, already ingested, into risk insights -- the second signal source wired into Risk Intelligence's own detection layer, using the same per-entity dedup guard the CVE job also relies on.",
      category: "analysis",
      run: async (now) => {
        const { created, failed } = await generateInsightsFromCampaigns(threatIntelRepo, riskIntelRepo, now);
        return { summary: `${created.length} insights created, ${failed.length} failed` };
      },
    },
    {
      key: "external-signal-ingestion-compliance",
      name: "External Signal Ingestion (Compliance Obligations)",
      description: "Converts staff-approved compliance obligations with a deadline in the next 90 days into risk insights, one per applicable industry -- the third signal source wired into Risk Intelligence's own detection layer, and the first with real industry scoping rather than the cross-industry sentinel.",
      category: "analysis",
      run: async (now) => {
        const { created, failed } = await generateInsightsFromComplianceObligations(complianceRepo, riskIntelRepo, now);
        return { summary: `${created.length} insights created, ${failed.length} failed` };
      },
    },
  ];

  if (aiProvider) {
    definitions.push({
      key: "compliance-analysis",
      name: "Compliance Analysis",
      description: "AI-analyzes ingested regulatory updates that don't have an analysis yet.",
      category: "analysis",
      run: async (now) => {
        const result = await analyzeUnanalyzedUpdates(complianceRepo, aiProvider, COMPLIANCE_ANALYSIS_BATCH_LIMIT, now);
        return { summary: `${result.analyzed} analyzed, ${result.failed} failed` };
      },
    });
  }

  return definitions;
}

/**
 * PER-SOURCE ingestion jobs, derived fresh on every scheduler tick
 * from whichever ComplianceSource rows are currently active and
 * non-manual -- not a static list, since staff can add/deactivate
 * sources at any time through the existing Source Management UI, and
 * this needs to reflect that immediately, not go stale until a server
 * restart.
 */
export async function buildSourceIngestionJobDefinitions(complianceRepo: ComplianceRepository): Promise<JobDefinition[]> {
  const sources = await complianceRepo.listSources({ activeOnly: true });
  return sources
    .filter((source) => source.sourceType !== "manual")
    .map((source) => ({
      key: `source-ingestion:${source.id}`,
      name: source.name,
      description: `Pulls new items from ${source.name} (${source.sourceType}).`,
      category: "ingestion" as const,
      run: async (now: Date) => {
        const result = await runComplianceIngestionForSource(complianceRepo, source, now);
        if (result.status === "error") {
          throw new Error(result.error ?? "ingestion failed for an unknown reason");
        }
        const s = result.summary;
        return { summary: s ? `${s.inserted} inserted, ${s.duplicate} duplicate` : "no items returned" };
      },
    }));
}
