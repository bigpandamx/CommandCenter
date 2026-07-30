/**
 * Intelligence Reports: analyst-authored synthesis documents that can
 * cross-reference many patterns/actors/CVEs at once. See types.ts's
 * own doc comment on IntelligenceReport and
 * 0057_intelligence_reports.sql for the full reasoning, including why
 * this is a distinct concept from Threat Advisories
 * (advisoryGeneration.ts) rather than a duplicate of it.
 *
 * status is draft/published with free transitions in both directions
 * -- matching Governance's own PolicyStatus (draft/active/retired,
 * "fully-connected, no restriction"), not CustomerPolicy's terminal
 * pending_review -> reviewed/rejected outcome. Publishing an
 * Intelligence Report is a visibility decision an analyst can revisit
 * (a report drafted too early, or one that needs another look before
 * staying visible), not a closed decision with a stated result the
 * way a policy review is.
 */
import { randomUUID } from "node:crypto";
import type { ThreatIntelRepository } from "./repository.js";
import type { IntelligenceReport, IntelligenceReportSearchQuery } from "./types.js";

export class IntelligenceReportError extends Error {
  constructor(
    message: string,
    public readonly code: "report_not_found",
  ) {
    super(message);
    this.name = "IntelligenceReportError";
  }
}

export interface CreateIntelligenceReportInput {
  title: string;
  summary: string;
  body: string;
  relatedPatternIds?: string[];
  relatedActorIds?: string[];
  relatedVulnerabilityCveIds?: string[];
}

export async function createIntelligenceReport(
  repo: ThreatIntelRepository,
  input: CreateIntelligenceReportInput,
  authoredByStaffId: string,
  now: Date = new Date(),
): Promise<IntelligenceReport> {
  const report: IntelligenceReport = {
    id: randomUUID(),
    title: input.title,
    summary: input.summary,
    body: input.body,
    relatedPatternIds: input.relatedPatternIds && input.relatedPatternIds.length > 0 ? input.relatedPatternIds : null,
    relatedActorIds: input.relatedActorIds && input.relatedActorIds.length > 0 ? input.relatedActorIds : null,
    relatedVulnerabilityCveIds:
      input.relatedVulnerabilityCveIds && input.relatedVulnerabilityCveIds.length > 0 ? input.relatedVulnerabilityCveIds : null,
    status: "draft",
    authoredByStaffId,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await repo.createIntelligenceReport(report);
  return report;
}

export async function listIntelligenceReports(
  repo: ThreatIntelRepository,
  query?: IntelligenceReportSearchQuery,
): Promise<IntelligenceReport[]> {
  return repo.searchIntelligenceReports(query ?? {});
}

export async function requireReportById(repo: ThreatIntelRepository, id: string): Promise<IntelligenceReport> {
  const report = await repo.getIntelligenceReportById(id);
  if (!report) {
    throw new IntelligenceReportError(`No intelligence report with id "${id}"`, "report_not_found");
  }
  return report;
}

export interface UpdateIntelligenceReportInput {
  title?: string;
  summary?: string;
  body?: string;
  relatedPatternIds?: string[];
  relatedActorIds?: string[];
  relatedVulnerabilityCveIds?: string[];
}

/** A partial update -- an omitted field keeps its current value, same convention as editService's own doc comment. Editable regardless of status; a published report needing a correction doesn't need to be unpublished first. */
export async function updateIntelligenceReport(
  repo: ThreatIntelRepository,
  id: string,
  input: UpdateIntelligenceReportInput,
  now: Date = new Date(),
): Promise<IntelligenceReport> {
  const report = await requireReportById(repo, id);
  const updated: IntelligenceReport = {
    ...report,
    title: input.title ?? report.title,
    summary: input.summary ?? report.summary,
    body: input.body ?? report.body,
    relatedPatternIds: input.relatedPatternIds !== undefined ? (input.relatedPatternIds.length > 0 ? input.relatedPatternIds : null) : report.relatedPatternIds,
    relatedActorIds: input.relatedActorIds !== undefined ? (input.relatedActorIds.length > 0 ? input.relatedActorIds : null) : report.relatedActorIds,
    relatedVulnerabilityCveIds:
      input.relatedVulnerabilityCveIds !== undefined
        ? input.relatedVulnerabilityCveIds.length > 0
          ? input.relatedVulnerabilityCveIds
          : null
        : report.relatedVulnerabilityCveIds,
    updatedAt: now,
  };
  await repo.updateIntelligenceReport(updated);
  return updated;
}

export async function publishIntelligenceReport(repo: ThreatIntelRepository, id: string, now: Date = new Date()): Promise<IntelligenceReport> {
  const report = await requireReportById(repo, id);
  const updated: IntelligenceReport = { ...report, status: "published", publishedAt: now, updatedAt: now };
  await repo.updateIntelligenceReport(updated);
  return updated;
}

/** Reverses publishIntelligenceReport -- see this file's own top comment for why that's a legitimate, revisitable action here, unlike a terminal review outcome. publishedAt is deliberately left as-is, not cleared -- it's a historical fact ("this was published, once, at this time"), not a live status flag; status alone answers "is it currently visible." */
export async function unpublishIntelligenceReport(repo: ThreatIntelRepository, id: string, now: Date = new Date()): Promise<IntelligenceReport> {
  const report = await requireReportById(repo, id);
  const updated: IntelligenceReport = { ...report, status: "draft", updatedAt: now };
  await repo.updateIntelligenceReport(updated);
  return updated;
}
