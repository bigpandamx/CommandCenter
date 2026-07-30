import type { ComplianceRepository } from "./repository.js";
import { ingestComplianceItems } from "./ingestion.js";
import { recordFetchOutcome } from "./sourceManagement.js";
import { fetchRssSource } from "./rssAdapter.js";
import { fetchFederalRegisterUpdates } from "./federalRegisterAdapter.js";
import type { ComplianceSource, IngestionSummary } from "./types.js";

/**
 * Intended to run on a schedule (e.g. hourly) -- not built as an actual
 * cron job here, same "not yet done" tier as the telemetry retention job
 * and the health-sweep scheduler in Edge-Devices. Whoever wires up the
 * scheduler just needs to call runComplianceIngestion(repo) periodically.
 */
export interface SourceRunResult {
  sourceId: string;
  sourceName: string;
  status: "success" | "error";
  summary: IngestionSummary | null;
  error: string | null;
}

function adapterFor(source: ComplianceSource): (s: ComplianceSource) => ReturnType<typeof fetchRssSource> {
  switch (source.sourceType) {
    case "rss":
    case "atom":
      return fetchRssSource;
    case "json_api":
      // NOTE: today this always uses the Federal Register mapper
      // regardless of which json_api source it is. That's fine while
      // Federal Register is the only json_api source configured; the
      // moment a second JSON API source is added, this needs a real
      // per-source adapter selector (e.g. keyed by source.name or a new
      // `adapterKey` field) instead of a hardcoded assumption. Flagging
      // this now rather than let it become a silent wrong-adapter bug
      // later.
      return fetchFederalRegisterUpdates;
    case "manual":
      // Should never actually be reached -- runComplianceIngestion
      // filters manual sources out before calling this, and
      // runComplianceIngestionForSource is documented as not meant to
      // be called directly against a manual source either. Throwing
      // here (rather than silently no-op-ing) makes a caller that
      // bypasses the filter fail loudly instead of quietly doing
      // nothing.
      throw new Error(`"${source.name}" is a manual source -- it has no fetch adapter. Use addManualComplianceUpdate instead.`);
  }
}

export async function runComplianceIngestionForSource(
  repo: ComplianceRepository,
  source: ComplianceSource,
  now: Date = new Date(),
): Promise<SourceRunResult> {
  try {
    const fetchFn = adapterFor(source);
    const items = await fetchFn(source);
    const summary = await ingestComplianceItems(repo, source, items, now);
    await recordFetchOutcome(repo, source.id, { status: "success" }, now);
    return { sourceId: source.id, sourceName: source.name, status: "success", summary, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordFetchOutcome(repo, source.id, { status: "error", error: message }, now);
    return { sourceId: source.id, sourceName: source.name, status: "error", summary: null, error: message };
  }
}

/** Runs ingestion for every active, non-manual source, independently -- one source's failure never blocks the others. Manual sources are skipped entirely; they have no fetch adapter (see adapterFor) and are populated via addManualComplianceUpdate instead. */
export async function runComplianceIngestion(
  repo: ComplianceRepository,
  now: Date = new Date(),
): Promise<SourceRunResult[]> {
  const sources = await repo.listSources({ activeOnly: true });
  const results: SourceRunResult[] = [];
  for (const source of sources) {
    if (source.sourceType === "manual") continue;
    results.push(await runComplianceIngestionForSource(repo, source, now));
  }
  return results;
}
