import { randomUUID } from "node:crypto";
import type { ComplianceRepository } from "./repository.js";
import type { ComplianceSource, CreateComplianceSourceInput, IngestionSummary, NormalizedComplianceItem } from "./types.js";
import { ingestComplianceItems } from "./ingestion.js";

export class ComplianceSourceError extends Error {
  constructor(
    message: string,
    public readonly code: "source_not_found" | "invalid_url" | "not_manual_source",
  ) {
    super(message);
    this.name = "ComplianceSourceError";
  }
}

function isPlausibleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export async function registerComplianceSource(
  repo: ComplianceRepository,
  input: CreateComplianceSourceInput & { scheduleIntervalMinutes?: number | null },
  now: Date = new Date(),
): Promise<ComplianceSource> {
  if (!isPlausibleUrl(input.url)) {
    throw new ComplianceSourceError(`Not a valid http(s) URL: "${input.url}"`, "invalid_url");
  }

  const source: ComplianceSource = {
    id: randomUUID(),
    name: input.name,
    jurisdiction: input.jurisdiction,
    frameworkTags: input.frameworkTags,
    sourceType: input.sourceType,
    url: input.url,
    isActive: true,
    lastFetchedAt: null,
    lastFetchStatus: "never_run",
    lastFetchError: null,
    scheduleIntervalMinutes: input.scheduleIntervalMinutes ?? null,
    createdAt: now,
  };
  await repo.createSource(source);
  return source;
}

export async function deactivateComplianceSource(repo: ComplianceRepository, sourceId: string): Promise<void> {
  const source = await repo.getSourceById(sourceId);
  if (!source) {
    throw new ComplianceSourceError(`Unknown compliance source: ${sourceId}`, "source_not_found");
  }
  await repo.deactivateSource(sourceId);
}

/** The other half of deactivateComplianceSource -- re-enables a source so the scheduler considers it again. No dedicated repository method for this (unlike deactivateSource); updateSource with the full object, same pattern recordFetchOutcome already uses for a partial-field change. */
export async function activateComplianceSource(repo: ComplianceRepository, sourceId: string): Promise<void> {
  const source = await repo.getSourceById(sourceId);
  if (!source) {
    throw new ComplianceSourceError(`Unknown compliance source: ${sourceId}`, "source_not_found");
  }
  await repo.updateSource({ ...source, isActive: true });
}

/** Staff-recorded schedule intent -- see ComplianceSource.scheduleIntervalMinutes's own doc comment for why this is metadata, not an enforced cron. */
export async function updateSourceSchedule(repo: ComplianceRepository, sourceId: string, scheduleIntervalMinutes: number | null): Promise<void> {
  const source = await repo.getSourceById(sourceId);
  if (!source) {
    throw new ComplianceSourceError(`Unknown compliance source: ${sourceId}`, "source_not_found");
  }
  await repo.updateSource({ ...source, scheduleIntervalMinutes });
}

/** Records the outcome of a fetch attempt against a source -- called by the ingestion orchestrator (ingestion.ts) after each run, success or failure. */
export async function recordFetchOutcome(
  repo: ComplianceRepository,
  sourceId: string,
  outcome: { status: "success" | "error"; error?: string | null },
  now: Date = new Date(),
): Promise<void> {
  const source = await repo.getSourceById(sourceId);
  if (!source) {
    throw new ComplianceSourceError(`Unknown compliance source: ${sourceId}`, "source_not_found");
  }
  await repo.updateSource({
    ...source,
    lastFetchedAt: now,
    lastFetchStatus: outcome.status,
    lastFetchError: outcome.status === "error" ? outcome.error ?? "unknown error" : null,
  });
}

/**
 * Hand-adds one document to a manual source -- the "Manual Sources"
 * capability: for regulatory bodies (ISO, some state regulators) with
 * no machine-readable feed, staff enter the document themselves
 * instead of the scheduler fetching it. Reuses ingestComplianceItems
 * directly (same dedup-by-externalId behavior, same
 * NormalizedComplianceItem shape) rather than a separate insert path --
 * a manually-added document is still just a ComplianceUpdate, and
 * should go through the exact same validation and dedup logic
 * automated ingestion does. Rejects if the source isn't actually
 * sourceType "manual" -- this is not a backdoor around the real fetch
 * pipeline for RSS/API sources.
 */
export async function addManualComplianceUpdate(
  repo: ComplianceRepository,
  sourceId: string,
  item: NormalizedComplianceItem,
  now: Date = new Date(),
): Promise<IngestionSummary> {
  const source = await repo.getSourceById(sourceId);
  if (!source) {
    throw new ComplianceSourceError(`Unknown compliance source: ${sourceId}`, "source_not_found");
  }
  if (source.sourceType !== "manual") {
    throw new ComplianceSourceError(`"${source.name}" is a ${source.sourceType} source, not a manual one -- use ingestion instead`, "not_manual_source");
  }
  return ingestComplianceItems(repo, source, [item], now);
}
